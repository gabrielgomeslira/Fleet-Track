using FleetApi.Models;
using FleetApi.Tests.Infra;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// T-06 / R3: o mapeamento EF (snake_case feito a mao) bate com o esquema real criado pelas migracoes.
/// Uma coluna renomeada so quebraria em runtime; aqui quebra no teste.
/// </summary>
public sealed class MapeamentoEfTests(DbFixture banco) : TesteComBanco(banco)
{
    private static readonly Dictionary<string, (string Coluna, string Tipo, bool Nulavel)[]> Esperado = new()
    {
        ["vehicles"] =
        [
            ("id", "uuid", false), ("plate", "character varying", false), ("model", "character varying", false),
            ("driver_name", "character varying", false), ("status", "character varying", false),
            ("latitude", "double precision", true), ("longitude", "double precision", true),
            ("speed", "double precision", true), ("fuel_level", "integer", true),
            ("updated_at", "timestamp with time zone", false), ("last_signal_at", "timestamp with time zone", true),
        ],
        ["deliveries"] =
        [
            ("id", "uuid", false), ("vehicle_id", "uuid", false), ("origin", "character varying", false),
            ("destination", "character varying", false), ("status", "character varying", false),
            ("created_at", "timestamp with time zone", false), ("delivered_at", "timestamp with time zone", true),
            ("route_path", "jsonb", true),
        ],
        ["telemetry_records"] =
        [
            ("id", "uuid", false), ("vehicle_id", "uuid", false), ("latitude", "double precision", false),
            ("longitude", "double precision", false), ("speed", "double precision", true),
            ("fuel_level", "integer", true), ("recorded_at", "timestamp with time zone", false),
        ],
    };

    [Theory]
    [InlineData("vehicles")]
    [InlineData("deliveries")]
    [InlineData("telemetry_records")]
    public async Task Tabela_tem_exatamente_as_colunas_tipos_e_nulidade_esperados(string tabela)
    {
        var real = new List<(string, string, bool)>();
        await using (var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste))
        {
            await conexao.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
                "WHERE table_schema = 'public' AND table_name = @t", conexao);
            cmd.Parameters.AddWithValue("t", tabela);
            await using var leitor = await cmd.ExecuteReaderAsync();
            while (await leitor.ReadAsync())
                real.Add((leitor.GetString(0), leitor.GetString(1), leitor.GetString(2) == "YES"));
        }

        Assert.Equal(
            Esperado[tabela].OrderBy(c => c.Coluna, StringComparer.Ordinal).ToArray(),
            real.OrderBy(c => c.Item1, StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task Veiculo_gravado_em_SQL_com_todas_as_colunas_volta_com_todas_as_propriedades()
    {
        var id = Guid.NewGuid();
        var instante = new DateTime(2026, 5, 6, 7, 8, 9, DateTimeKind.Utc);
        await Executar(
            "INSERT INTO vehicles (id, plate, model, driver_name, status, latitude, longitude, speed, fuel_level, " +
            "updated_at, last_signal_at) VALUES (@id, 'ZZZ9Z99', 'Modelo X', 'Ana', 'em_rota', -19.5, -43.25, 71.5, 38, " +
            "@u, @s)", ("id", id), ("u", instante), ("s", instante.AddMinutes(-1)));

        await using var db = DbFixture.CriarContexto();
        var v = await db.Vehicles.SingleAsync(x => x.Id == id);

        Assert.Equal("ZZZ9Z99", v.Plate);
        Assert.Equal("Modelo X", v.Model);
        Assert.Equal("Ana", v.DriverName);
        Assert.Equal("em_rota", v.Status);
        Assert.Equal(-19.5, v.Latitude);
        Assert.Equal(-43.25, v.Longitude);
        Assert.Equal(71.5, v.Speed);
        Assert.Equal(38, v.FuelLevel);
        Assert.Equal(instante, v.UpdatedAt);
        Assert.Equal(instante.AddMinutes(-1), v.LastSignalAt);
    }

    [Fact]
    public async Task Entrega_gravada_em_SQL_com_todas_as_colunas_volta_com_todas_as_propriedades()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v);
        var id = Guid.NewGuid();
        var criada = new DateTime(2026, 5, 1, 10, 0, 0, DateTimeKind.Utc);
        var entregue = criada.AddHours(5);
        await Executar(
            "INSERT INTO deliveries (id, vehicle_id, origin, destination, status, created_at, delivered_at, route_path) " +
            "VALUES (@id, @v, 'Belo Horizonte', 'Montes Claros', 'entregue', @c, @e, " +
            "'{\"type\":\"LineString\",\"coordinates\":[[-43.9,-19.9],[-43.8,-16.7]]}'::jsonb)",
            ("id", id), ("v", v.Id), ("c", criada), ("e", entregue));

        await using var db = DbFixture.CriarContexto();
        var d = await db.Deliveries.SingleAsync(x => x.Id == id);

        Assert.Equal(v.Id, d.VehicleId);
        Assert.Equal("Belo Horizonte", d.Origin);
        Assert.Equal("Montes Claros", d.Destination);
        Assert.Equal("entregue", d.Status);
        Assert.Equal(criada, d.CreatedAt);
        Assert.Equal(entregue, d.DeliveredAt);
        Assert.NotNull(d.RoutePath);
        Assert.Contains("LineString", d.RoutePath);
    }

    [Fact]
    public async Task Telemetria_gravada_em_SQL_com_todas_as_colunas_volta_com_todas_as_propriedades()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v);
        var id = Guid.NewGuid();
        var instante = new DateTime(2026, 5, 6, 7, 8, 9, DateTimeKind.Utc);
        await Executar(
            "INSERT INTO telemetry_records (id, vehicle_id, latitude, longitude, speed, fuel_level, recorded_at) " +
            "VALUES (@id, @v, -23.55, -46.63, 88.25, 64, @r)", ("id", id), ("v", v.Id), ("r", instante));

        await using var db = DbFixture.CriarContexto();
        var t = await db.TelemetryRecords.SingleAsync(x => x.Id == id);

        Assert.Equal(v.Id, t.VehicleId);
        Assert.Equal(-23.55, t.Latitude);
        Assert.Equal(-46.63, t.Longitude);
        Assert.Equal(88.25, t.Speed);
        Assert.Equal(64, t.FuelLevel);
        Assert.Equal(instante, t.RecordedAt);
    }

    [Fact]
    public async Task Entidades_gravadas_pelo_EF_voltam_iguais_inclusive_nulos_e_zero()
    {
        var v = new Vehicle
        {
            Id = Guid.NewGuid(), Plate = "ZERO000", Model = "M", DriverName = "D", Status = "parado",
            Latitude = null, Longitude = null, Speed = 0, FuelLevel = 0, LastSignalAt = null,
        };
        var t = new TelemetryRecord
        {
            Id = Guid.NewGuid(), VehicleId = v.Id, Latitude = 0, Longitude = 0, Speed = null, FuelLevel = null,
            RecordedAt = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc),
        };
        await Dados.GravarAsync(v, t);

        await using var db = DbFixture.CriarContexto();
        var lido = await db.Vehicles.SingleAsync(x => x.Id == v.Id);
        var lidoT = await db.TelemetryRecords.SingleAsync(x => x.Id == t.Id);

        // Zero gravado de proposito nao pode virar o padrao do banco, e nulo nao pode virar zero.
        Assert.Equal(0, lido.Speed);
        Assert.Equal(0, lido.FuelLevel);
        Assert.Null(lido.Latitude);
        Assert.Null(lido.Longitude);
        Assert.Null(lido.LastSignalAt);
        Assert.Equal(0, lidoT.Latitude);
        Assert.Null(lidoT.Speed);
        Assert.Null(lidoT.FuelLevel);
        Assert.Equal(DateTimeKind.Utc, lidoT.RecordedAt.Kind);
    }

    [Fact]
    public async Task Banco_recusa_posicao_pela_metade_e_posicao_sem_sinal()
    {
        const string cabecalho = "INSERT INTO vehicles (id, plate, model, driver_name, latitude, longitude, last_signal_at) VALUES ";

        var metade = await Assert.ThrowsAsync<PostgresException>(() =>
            Executar(cabecalho + "(@id, 'AAA1A11', 'M', 'D', -10, NULL, NOW())", ("id", Guid.NewGuid())));
        var semSinal = await Assert.ThrowsAsync<PostgresException>(() =>
            Executar(cabecalho + "(@id, 'BBB2B22', 'M', 'D', -10, -40, NULL)", ("id", Guid.NewGuid())));

        Assert.Equal("ck_vehicles_posicao_completa", metade.ConstraintName);
        Assert.Equal("ck_vehicles_posicao_com_sinal", semSinal.ConstraintName);
    }

    [Fact]
    public async Task Banco_recusa_entrega_e_telemetria_de_veiculo_inexistente()
    {
        var entrega = await Assert.ThrowsAsync<PostgresException>(() => Executar(
            "INSERT INTO deliveries (id, vehicle_id, origin, destination) VALUES (@id, @v, 'A', 'B')",
            ("id", Guid.NewGuid()), ("v", Guid.NewGuid())));
        var telemetria = await Assert.ThrowsAsync<PostgresException>(() => Executar(
            "INSERT INTO telemetry_records (id, vehicle_id, latitude, longitude) VALUES (@id, @v, 0, 0)",
            ("id", Guid.NewGuid()), ("v", Guid.NewGuid())));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, entrega.SqlState);
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, telemetria.SqlState);
    }

    private static async Task Executar(string sql, params (string Nome, object Valor)[] parametros)
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var comando = new NpgsqlCommand(sql, conexao);
        foreach (var (nome, valor) in parametros) comando.Parameters.AddWithValue(nome, valor);
        await comando.ExecuteNonQueryAsync();
    }
}
