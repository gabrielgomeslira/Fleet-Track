using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

/// <summary>T-14: instantes em timestamptz (ISO 8601 UTC com Z na API) e indices de consulta.</summary>
public sealed partial class InstantesEIndicesTests(DbFixture banco) : TesteComBanco(banco)
{
    // Termina em "Z" (UTC). Sem "Z" o navegador leria o horario como local.
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")]
    private static partial Regex InstanteUtc();

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex DiaPuro();

    [Fact]
    public async Task Veiculos_entregas_e_telemetria_saem_em_ISO_8601_UTC_com_Z()
    {
        var (veiculo, entrega) = await GravarVeiculoComEntregaETelemetria();
        using var cliente = Banco.Factory.CreateClient();

        var listaVeiculos = await LerJson(cliente, "/api/vehicles");
        var detalheVeiculo = await LerJson(cliente, $"/api/vehicles/{veiculo.Id}");
        var listaEntregas = await LerJson(cliente, "/api/deliveries");
        var detalheEntrega = await LerJson(cliente, $"/api/deliveries/{entrega.Id}");
        var telemetria = await LerJson(cliente, $"/api/telemetry/{veiculo.Id}");

        AssertUtc(listaVeiculos[0].GetProperty("updatedAt"));
        AssertUtc(detalheVeiculo.GetProperty("updatedAt"));
        AssertUtc(detalheVeiculo.GetProperty("deliveries")[0].GetProperty("createdAt"));
        AssertUtc(detalheVeiculo.GetProperty("deliveries")[0].GetProperty("deliveredAt"));
        AssertUtc(listaEntregas[0].GetProperty("createdAt"));
        AssertUtc(listaEntregas[0].GetProperty("deliveredAt"));
        AssertUtc(detalheEntrega.GetProperty("createdAt"));
        AssertUtc(detalheEntrega.GetProperty("deliveredAt"));
        AssertUtc(telemetria[0].GetProperty("recordedAt"));
    }

    [Fact]
    public async Task Instante_gravado_volta_identico_da_API()
    {
        var instante = new DateTime(2026, 3, 15, 23, 30, 0, DateTimeKind.Utc);
        var veiculo = NovoVeiculo("AAA1A11");
        await using (var db = DbFixture.CriarContexto())
        {
            db.Vehicles.Add(veiculo);
            db.TelemetryRecords.Add(new TelemetryRecord { VehicleId = veiculo.Id, RecordedAt = instante });
            await db.SaveChangesAsync();
        }
        using var cliente = Banco.Factory.CreateClient();

        var telemetria = await LerJson(cliente, $"/api/telemetry/{veiculo.Id}");

        Assert.Equal("2026-03-15T23:30:00Z", telemetria[0].GetProperty("recordedAt").GetString());
    }

    [Fact]
    public async Task Entregas_por_dia_saem_como_dia_puro_no_dia_UTC_da_entrega()
    {
        // 02:00 UTC ainda e o dia anterior no Brasil (UTC-3): o dia da API tem que ser o UTC.
        var dia = DateTime.UtcNow.Date.AddDays(-2);
        var entregueEm = DateTime.SpecifyKind(dia.AddHours(2), DateTimeKind.Utc);
        var veiculo = NovoVeiculo("BBB2B22");
        await using (var db = DbFixture.CriarContexto())
        {
            db.Vehicles.Add(veiculo);
            db.Deliveries.Add(new Delivery
            {
                VehicleId = veiculo.Id, Origin = "A", Destination = "B", Status = "entregue",
                CreatedAt = entregueEm.AddHours(-5), DeliveredAt = entregueEm,
            });
            await db.SaveChangesAsync();
        }
        using var cliente = Banco.Factory.CreateClient();

        var stats = await LerJson(cliente, "/api/dashboard/stats");

        var dias = stats.GetProperty("deliveriesPerDay");
        Assert.Equal(1, dias.GetArrayLength());
        var texto = dias[0].GetProperty("date").GetString()!;
        Assert.Matches(DiaPuro(), texto);
        Assert.Equal(dia.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), texto);
        Assert.Equal(1, dias[0].GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Entrega_exatamente_no_corte_de_14_dias_nao_entra_no_grafico()
    {
        // A comparacao e estrita (>): "ha exatamente 14 dias" fica de fora. O corte usa now() do
        // processo, entao a entrega fica 1 minuto antes dele para o teste nao depender do relogio.
        var veiculo = NovoVeiculo("CCC3C33");
        var antesDoCorte = DateTime.UtcNow.AddDays(-14).AddMinutes(-1);
        await using (var db = DbFixture.CriarContexto())
        {
            db.Vehicles.Add(veiculo);
            db.Deliveries.Add(new Delivery
            {
                VehicleId = veiculo.Id, Origin = "A", Destination = "B", Status = "entregue",
                CreatedAt = antesDoCorte.AddDays(-1), DeliveredAt = antesDoCorte,
            });
            await db.SaveChangesAsync();
        }
        using var cliente = Banco.Factory.CreateClient();

        var stats = await LerJson(cliente, "/api/dashboard/stats");

        Assert.Equal(0, stats.GetProperty("deliveriesPerDay").GetArrayLength());
    }

    [Fact]
    public async Task Colunas_de_instante_sao_timestamptz()
    {
        await using var conexao = await AbrirConexao();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT count(*) FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND data_type = 'timestamp with time zone'
              AND (table_name, column_name) IN (
                ('vehicles', 'updated_at'), ('deliveries', 'created_at'),
                ('deliveries', 'delivered_at'), ('telemetry_records', 'recorded_at'))
            """, conexao);

        Assert.Equal(4L, (long)(await cmd.ExecuteScalarAsync())!);
    }

    [Theory]
    [InlineData("IX_telemetry_records_vehicle_id_recorded_at", "(vehicle_id, recorded_at DESC)", true)]
    [InlineData("IX_deliveries_created_at_id", "(created_at DESC, id DESC)", false)]
    [InlineData("IX_deliveries_status_created_at", "(status, created_at DESC)", false)]
    [InlineData("IX_deliveries_vehicle_id", "(vehicle_id)", false)]
    [InlineData("IX_vehicles_plate_id", "(plate, id)", false)]
    public async Task Indice_existe_com_as_colunas_e_a_ordem_da_tarefa(string nome, string colunas, bool unico)
    {
        await using var conexao = await AbrirConexao();
        await using var cmd = new NpgsqlCommand(
            "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = @n", conexao);
        cmd.Parameters.AddWithValue("n", nome);

        var definicao = (string?)await cmd.ExecuteScalarAsync();

        Assert.NotNull(definicao);
        Assert.EndsWith(colunas, definicao);
        Assert.Equal(unico, definicao.Contains("CREATE UNIQUE INDEX", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Indice_redundante_de_telemetria_por_vehicle_id_foi_removido()
    {
        await using var conexao = await AbrirConexao();
        await using var cmd = new NpgsqlCommand(
            "SELECT count(*) FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'IX_telemetry_records_vehicle_id'",
            conexao);

        Assert.Equal(0L, (long)(await cmd.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Telemetria_repetida_do_mesmo_veiculo_no_mesmo_instante_e_recusada_pelo_banco()
    {
        var instante = new DateTime(2026, 5, 1, 12, 0, 30, DateTimeKind.Utc);
        var veiculo = NovoVeiculo("DDD4D44");
        await using var db = DbFixture.CriarContexto();
        db.Vehicles.Add(veiculo);
        db.TelemetryRecords.Add(new TelemetryRecord { VehicleId = veiculo.Id, RecordedAt = instante });
        await db.SaveChangesAsync();

        db.TelemetryRecords.Add(new TelemetryRecord { VehicleId = veiculo.Id, RecordedAt = instante });
        var erro = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());

        Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)erro.InnerException!).SqlState);
    }

    [Fact]
    public async Task Mesmo_instante_em_veiculos_diferentes_e_aceito()
    {
        var instante = new DateTime(2026, 5, 1, 12, 0, 30, DateTimeKind.Utc);
        var a = NovoVeiculo("EEE5E55");
        var b = NovoVeiculo("FFF6F66");
        await using var db = DbFixture.CriarContexto();
        db.Vehicles.AddRange(a, b);
        db.TelemetryRecords.AddRange(
            new TelemetryRecord { VehicleId = a.Id, RecordedAt = instante },
            new TelemetryRecord { VehicleId = b.Id, RecordedAt = instante });

        // 2 veiculos + 2 registros de telemetria.
        Assert.Equal(4, await db.SaveChangesAsync());
    }

    [Fact]
    public async Task Consulta_de_telemetria_do_veiculo_usa_Index_Scan()
    {
        // Massa suficiente para o planner preferir o indice: 40 veiculos x 500 registros.
        await using (var conexao = await AbrirConexao())
        {
            await Executar(conexao,
                """
                INSERT INTO vehicles (id, plate, model, driver_name)
                SELECT uuid_in(md5('v' || n)::cstring), 'P' || n, 'M', 'D' FROM generate_series(1, 40) n;
                INSERT INTO telemetry_records (vehicle_id, latitude, longitude, recorded_at)
                SELECT v.id, 0, 0, TIMESTAMPTZ '2026-01-01 00:00:00+00' + (g * INTERVAL '30 seconds')
                FROM vehicles v, generate_series(1, 500) g;
                ANALYZE vehicles; ANALYZE telemetry_records;
                """);
        }

        await using var conexaoPlano = await AbrirConexao();
        await using var cmd = new NpgsqlCommand(
            """
            EXPLAIN SELECT id, latitude, longitude, speed, fuel_level, recorded_at
            FROM telemetry_records
            WHERE vehicle_id = (SELECT id FROM vehicles WHERE plate = 'P7')
            ORDER BY recorded_at DESC
            LIMIT 50
            """, conexaoPlano);
        var linhas = new List<string>();
        await using (var leitor = await cmd.ExecuteReaderAsync())
        {
            while (await leitor.ReadAsync())
            {
                linhas.Add(leitor.GetString(0));
            }
        }
        var plano = string.Join(Environment.NewLine, linhas);

        Assert.Contains("Index Scan", plano);
        Assert.Contains("IX_telemetry_records_vehicle_id_recorded_at", plano);
        Assert.DoesNotContain("Seq Scan on telemetry_records", plano);
    }

    [Fact]
    public async Task Migracao_preserva_o_instante_UTC_gravado_como_timestamp_mesmo_com_sessao_em_outro_fuso()
    {
        // Sessao em UTC-3 (sem horario de verao desde 2019): sem USING ... AT TIME ZONE 'UTC' o
        // Postgres leria o timestamp como hora de Sao Paulo e o instante andaria 3 horas.
        var conexaoSaoPaulo = new NpgsqlConnectionStringBuilder(ApiFactory.ConexaoDeTeste)
        {
            Timezone = "America/Sao_Paulo",
        }.ConnectionString;
        await using var db = new FleetApi.Data.AppDbContext(
            new DbContextOptionsBuilder<FleetApi.Data.AppDbContext>().UseNpgsql(conexaoSaoPaulo).Options);
        var migrador = db.GetService<IMigrator>();
        var baseline = (await db.Database.GetAppliedMigrationsAsync()).Single(m => m.EndsWith("_Baseline"));
        var veiculo = Guid.NewGuid();

        try
        {
            await migrador.MigrateAsync(baseline);
            await using (var conexao = new NpgsqlConnection(conexaoSaoPaulo))
            {
                await conexao.OpenAsync();
                await Executar(conexao,
                    $"""
                    INSERT INTO vehicles (id, plate, model, driver_name, updated_at)
                    VALUES ('{veiculo}', 'GGG7G77', 'M', 'D', '2026-01-10 12:00:00');
                    INSERT INTO telemetry_records (vehicle_id, latitude, longitude, recorded_at)
                    VALUES ('{veiculo}', 0, 0, '2026-01-10 12:00:00');
                    """);
            }

            await migrador.MigrateAsync();

            await using var leitura = new NpgsqlConnection(conexaoSaoPaulo);
            await leitura.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                """
                SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
                       to_char(t.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
                FROM vehicles v JOIN telemetry_records t ON t.vehicle_id = v.id WHERE v.id = @id
                """, leitura);
            cmd.Parameters.AddWithValue("id", veiculo);
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal("2026-01-10T12:00:00", r.GetString(0));
            Assert.Equal("2026-01-10T12:00:00", r.GetString(1));
        }
        finally
        {
            await migrador.MigrateAsync();
        }
    }

    [Fact]
    public async Task Down_da_T14_volta_a_timestamp_sem_deslocar_o_instante_e_sobe_de_novo()
    {
        await using var db = DbFixture.CriarContexto();
        var migrador = db.GetService<IMigrator>();
        var baseline = (await db.Database.GetAppliedMigrationsAsync()).Single(m => m.EndsWith("_Baseline"));
        var veiculo = NovoVeiculo("HHH8H88");
        veiculo.UpdatedAt = new DateTime(2026, 1, 10, 12, 0, 0, DateTimeKind.Utc);
        db.Vehicles.Add(veiculo);
        await db.SaveChangesAsync();

        try
        {
            await migrador.MigrateAsync(baseline);

            await using var conexao = await AbrirConexao();
            await using var cmd = new NpgsqlCommand(
                """
                SELECT (SELECT data_type FROM information_schema.columns
                        WHERE table_schema = current_schema() AND table_name = 'vehicles' AND column_name = 'updated_at'),
                       (SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') FROM vehicles WHERE id = @id)
                """, conexao);
            cmd.Parameters.AddWithValue("id", veiculo.Id);
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal("timestamp without time zone", r.GetString(0));
            Assert.Equal("2026-01-10T12:00:00", r.GetString(1));
        }
        finally
        {
            await migrador.MigrateAsync();
        }

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    private static Vehicle NovoVeiculo(string placa) => new()
    {
        Id = Guid.NewGuid(), Plate = placa, Model = "Modelo", DriverName = "Motorista", Status = "em_rota",
        UpdatedAt = DateTime.UtcNow,
    };

    private static async Task<(Vehicle, Delivery)> GravarVeiculoComEntregaETelemetria()
    {
        var veiculo = NovoVeiculo("ZZZ9Z99");
        var agora = DateTime.UtcNow;
        var entrega = new Delivery
        {
            Id = Guid.NewGuid(), VehicleId = veiculo.Id, Origin = "A", Destination = "B", Status = "entregue",
            CreatedAt = agora.AddHours(-3), DeliveredAt = agora.AddHours(-1),
        };
        await using var db = DbFixture.CriarContexto();
        db.Vehicles.Add(veiculo);
        db.Deliveries.Add(entrega);
        db.TelemetryRecords.Add(new TelemetryRecord { VehicleId = veiculo.Id, RecordedAt = agora });
        await db.SaveChangesAsync();
        return (veiculo, entrega);
    }

    private static async Task<JsonElement> LerJson(HttpClient cliente, string rota)
    {
        var resposta = await cliente.GetAsync(rota);
        resposta.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    private static void AssertUtc(JsonElement valor)
    {
        Assert.Equal(JsonValueKind.String, valor.ValueKind);
        Assert.Matches(InstanteUtc(), valor.GetString()!);
    }

    private static async Task<NpgsqlConnection> AbrirConexao()
    {
        var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        return conexao;
    }

    private static async Task Executar(NpgsqlConnection conexao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync();
    }
}
