using FleetApi.Tests.Infra;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// A fixture ja migrou o banco do zero (MigrateAsync). Estes testes conferem que o resultado
/// reproduz o antigo db/init.sql e que o modelo nao divergiu das migracoes.
/// </summary>
public sealed class MigracoesTests(DbFixture banco) : TesteComBanco(banco)
{
    [Fact]
    public async Task Banco_migrado_do_zero_nao_tem_migracao_pendente()
    {
        await using var db = DbFixture.CriarContexto();

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), m => m.EndsWith("_Baseline"));
    }

    [Fact]
    public async Task Modelo_do_EF_nao_diverge_das_migracoes()
    {
        await using var db = DbFixture.CriarContexto();

        // Falha se alguem mudou o modelo sem gerar a migracao correspondente.
        Assert.False(db.Database.HasPendingModelChanges(),
            "O modelo tem mudancas sem migracao. Rode: dotnet ef migrations add <Nome> --project backend");
    }

    [Theory]
    [InlineData("vehicles", "plate", "character varying", 10, "NO", null)]
    [InlineData("vehicles", "status", "character varying", 20, "NO", "'parado'::character varying")]
    [InlineData("vehicles", "latitude", "double precision", null, "YES", "'-23.55'::numeric")]
    [InlineData("vehicles", "longitude", "double precision", null, "YES", "'-46.63'::numeric")]
    [InlineData("vehicles", "last_signal_at", "timestamp with time zone", null, "YES", null)]
    [InlineData("vehicles", "fuel_level", "integer", null, "NO", "100")]
    [InlineData("vehicles", "updated_at", "timestamp with time zone", null, "NO", "now()")]
    [InlineData("deliveries", "origin", "character varying", 200, "NO", null)]
    [InlineData("deliveries", "status", "character varying", 20, "NO", "'pendente'::character varying")]
    [InlineData("deliveries", "delivered_at", "timestamp with time zone", null, "YES", null)]
    [InlineData("deliveries", "route_path", "jsonb", null, "YES", null)]
    [InlineData("telemetry_records", "recorded_at", "timestamp with time zone", null, "NO", "now()")]
    [InlineData("vehicles", "id", "uuid", null, "NO", "gen_random_uuid()")]
    [InlineData("deliveries", "id", "uuid", null, "NO", "gen_random_uuid()")]
    [InlineData("telemetry_records", "id", "uuid", null, "NO", "gen_random_uuid()")]
    public async Task Coluna_reproduz_o_schema_do_init_sql(
        string tabela, string coluna, string tipo, int? tamanho, string anulavel, string? padrao)
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT data_type, character_maximum_length, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = @t AND column_name = @c
            """, conexao);
        cmd.Parameters.AddWithValue("t", tabela);
        cmd.Parameters.AddWithValue("c", coluna);

        await using var leitor = await cmd.ExecuteReaderAsync();
        Assert.True(await leitor.ReadAsync(), $"Coluna {tabela}.{coluna} nao existe");
        Assert.Equal(tipo, leitor.GetString(0));
        Assert.Equal(tamanho, leitor.IsDBNull(1) ? null : leitor.GetInt32(1));
        Assert.Equal(anulavel, leitor.GetString(2));
        if (padrao is null)
        {
            Assert.True(leitor.IsDBNull(3));
        }
        else
        {
            Assert.Equal(padrao, leitor.GetString(3));
        }
    }

    [Fact]
    public async Task Migrar_de_novo_com_o_banco_em_dia_nao_altera_nada()
    {
        await using var db = DbFixture.CriarContexto();

        await db.Database.MigrateAsync();

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [Fact]
    public async Task Down_da_baseline_derruba_tudo_e_a_baseline_sobe_de_novo()
    {
        await using var db = DbFixture.CriarContexto();
        var migrador = db.GetService<IMigrator>();

        try
        {
            await migrador.MigrateAsync("0");
            Assert.Equal(0, await ContarTabelasDoModelo());
        }
        finally
        {
            await migrador.MigrateAsync();
        }

        Assert.Equal(3, await ContarTabelasDoModelo());
    }

    [Fact]
    public async Task Rota_da_entrega_e_so_expansao_e_o_Down_remove_apenas_a_coluna()
    {
        await using var db = DbFixture.CriarContexto();
        var migrador = db.GetService<IMigrator>();
        var anterior = (await db.Database.GetAppliedMigrationsAsync()).TakeWhile(m => !m.EndsWith("_RotaDaEntrega")).Last();
        Assert.EndsWith("_TimestamptzEIndices", anterior);

        try
        {
            await migrador.MigrateAsync(anterior);
            Assert.False(await ExisteColuna("deliveries", "route_path"));
            // O resto do esquema continua de pé.
            Assert.Equal(3, await ContarTabelasDoModelo());
            Assert.True(await ExisteColuna("deliveries", "delivered_at"));
        }
        finally
        {
            await migrador.MigrateAsync();
        }

        Assert.True(await ExisteColuna("deliveries", "route_path"));
    }

    [Fact]
    public async Task Ultimo_sinal_preenche_a_coluna_com_o_updated_at_de_quem_ja_existia()
    {
        await using var db = DbFixture.CriarContexto();
        var migrador = db.GetService<IMigrator>();
        var anterior = (await db.Database.GetAppliedMigrationsAsync()).TakeWhile(m => !m.EndsWith("_UltimoSinal")).Last();
        var atualizado = new DateTime(2026, 10, 30, 8, 15, 0, DateTimeKind.Utc);

        try
        {
            await migrador.MigrateAsync(anterior);
            Assert.False(await ExisteColuna("vehicles", "last_signal_at"));
            await ExecutarAsync(
                "INSERT INTO vehicles (plate, model, driver_name, updated_at) VALUES ('MIG-0001', 'm', 'd', @t)",
                ("t", atualizado));
        }
        finally
        {
            await migrador.MigrateAsync();
        }

        Assert.True(await ExisteColuna("vehicles", "last_signal_at"));
        var veiculo = await db.Vehicles.AsNoTracking().SingleAsync();
        Assert.Equal(atualizado, veiculo.LastSignalAt);
        Assert.Equal(atualizado, veiculo.UpdatedAt);
        Assert.Equal((-23.55, -46.63), (veiculo.Latitude, veiculo.Longitude));
    }

    [Fact]
    public async Task Down_do_ultimo_sinal_devolve_a_posicao_ao_que_era_obrigatorio()
    {
        await using var db = DbFixture.CriarContexto();
        var migrador = db.GetService<IMigrator>();
        var anterior = (await db.Database.GetAppliedMigrationsAsync()).TakeWhile(m => !m.EndsWith("_UltimoSinal")).Last();
        var semRegistro = Guid.NewGuid();
        var comRegistro = Guid.NewGuid();
        await ExecutarAsync(
            "INSERT INTO vehicles (id, plate, model, driver_name, latitude, longitude) VALUES (@a, 'MIG-0002', 'm', 'd', NULL, NULL), (@b, 'MIG-0003', 'm', 'd', NULL, NULL)",
            ("a", semRegistro), ("b", comRegistro));
        await ExecutarAsync(
            "INSERT INTO telemetry_records (vehicle_id, latitude, longitude, speed, fuel_level, recorded_at) VALUES (@b, -10.5, -40.25, 0, 50, now())",
            ("b", comRegistro));

        try
        {
            await migrador.MigrateAsync(anterior);

            Assert.False(await ExisteColuna("vehicles", "last_signal_at"));
            Assert.Equal("NO", await Anulavel("vehicles", "latitude"));
            Assert.Equal("NO", await Anulavel("vehicles", "longitude"));
        }
        finally
        {
            await migrador.MigrateAsync();
        }

        // Quem ainda tinha registro volta com a posição dele; quem não tinha, com o padrão do esquema.
        Assert.Equal((-23.55, -46.63), await Posicao(semRegistro));
        Assert.Equal((-10.5, -40.25), await Posicao(comRegistro));

        static async Task<(double?, double?)> Posicao(Guid id)
        {
            await using var leitura = DbFixture.CriarContexto();
            var v = await leitura.Vehicles.AsNoTracking().SingleAsync(x => x.Id == id);
            return (v.Latitude, v.Longitude);
        }
    }

    private static async Task ExecutarAsync(string sql, params (string Nome, object Valor)[] parametros)
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conexao);
        foreach (var (nome, valor) in parametros)
        {
            cmd.Parameters.AddWithValue(nome, valor);
        }
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<string> Anulavel(string tabela, string coluna)
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = @t AND column_name = @c",
            conexao);
        cmd.Parameters.AddWithValue("t", tabela);
        cmd.Parameters.AddWithValue("c", coluna);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<bool> ExisteColuna(string tabela, string coluna)
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT count(*) FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = @t AND column_name = @c
            """, conexao);
        cmd.Parameters.AddWithValue("t", tabela);
        cmd.Parameters.AddWithValue("c", coluna);
        return (long)(await cmd.ExecuteScalarAsync())! == 1;
    }

    private static async Task<long> ContarTabelasDoModelo()
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT count(*) FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name IN ('vehicles', 'deliveries', 'telemetry_records')
            """, conexao);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }
}
