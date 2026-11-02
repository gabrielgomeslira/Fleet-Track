using System.Net;
using FleetApi.Data;
using FleetApi.Demo;
using FleetApi.Jobs;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// T-35: o ciclo do job contra o Postgres real, com relógio manual. Os testes não esperam tempo
/// passar: o instante vem do <see cref="RelogioManual"/>.
/// </summary>
public sealed class SimulacaoJobTests(DbFixture banco) : TesteComBanco(banco)
{
    // Um instante qualquer, com segundos fora do múltiplo de 30, para provar o alinhamento.
    private static readonly DateTimeOffset Inicio = new(2026, 11, 1, 12, 0, 10, TimeSpan.Zero);
    private static readonly DateTime InstanteDoPrimeiroCiclo = new(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc);

    private static GeoRota RotaSpRj => new(Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").Pontos);

    private static ServiceProvider Servicos() =>
        new ServiceCollection()
            .AddDbContext<AppDbContext>(o => o.UseNpgsql(ApiFactory.ConexaoDeTeste))
            .BuildServiceProvider();

    private static SimulacaoJob NovoJob(ServiceProvider servicos, TimeProvider relogio) =>
        new(servicos.GetRequiredService<IServiceScopeFactory>(), relogio, NullLogger<SimulacaoJob>.Instance);

    private static async Task<Vehicle> CriarVeiculoAsync(
        string placa, string status, Ponto posicao, double velocidade = 0, int combustivel = 80)
    {
        await using var db = DbFixture.CriarContexto();
        var veiculo = new Vehicle
        {
            Id = Guid.NewGuid(), Plate = placa, Model = "Modelo", DriverName = "Motorista Ficticio", Status = status,
            Latitude = posicao.Latitude, Longitude = posicao.Longitude, Speed = velocidade, FuelLevel = combustivel,
            UpdatedAt = DateTime.UtcNow.AddHours(-1),
            LastSignalAt = DateTime.UtcNow.AddHours(-1), // quem tem posição tem sinal (CHECK, ADR-0017)
        };
        db.Vehicles.Add(veiculo);
        await db.SaveChangesAsync();
        return veiculo;
    }

    private static async Task CriarEntregaAsync(
        Guid veiculoId, string status, string? rotaGeoJson, TimeSpan idade = default)
    {
        await using var db = DbFixture.CriarContexto();
        db.Deliveries.Add(new Delivery
        {
            VehicleId = veiculoId, Origin = "São Paulo, SP", Destination = "Rio de Janeiro, RJ", Status = status,
            CreatedAt = DateTime.UtcNow - idade, RoutePath = rotaGeoJson,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Vehicle> LerVeiculoAsync(Guid id)
    {
        await using var db = DbFixture.CriarContexto();
        return await db.Vehicles.AsNoTracking().SingleAsync(v => v.Id == id);
    }

    private static async Task<List<TelemetryRecord>> LerTelemetriaAsync(Guid veiculoId)
    {
        await using var db = DbFixture.CriarContexto();
        return await db.TelemetryRecords.AsNoTracking()
            .Where(t => t.VehicleId == veiculoId).OrderBy(t => t.RecordedAt).ToListAsync();
    }

    private static async Task<int> ContarTelemetriaAsync()
    {
        await using var db = DbFixture.CriarContexto();
        return await db.TelemetryRecords.CountAsync();
    }

    private static double Metros(Ponto a, double latitude, double longitude) =>
        GeoRota.Distancia(a, new Ponto(longitude, latitude));

    [Fact]
    public async Task Ciclo_grava_um_registro_para_todos_os_veiculos_inclusive_parados_e_em_manutencao()
    {
        var rota = RotaSpRj;
        var emRota = await CriarVeiculoAsync("AAA-0001", "em_rota", rota.Inicio, velocidade: 72);
        await CriarEntregaAsync(emRota.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        var parado = await CriarVeiculoAsync("AAA-0002", "parado", new Ponto(-49.2733, -25.4284), velocidade: 33, combustivel: 92);
        var manutencao = await CriarVeiculoAsync("AAA-0003", "manutencao", new Ponto(-46.6333, -23.5505), combustivel: 30);
        using var servicos = Servicos();

        var gravados = await NovoJob(servicos, new RelogioManual(Inicio)).ExecutarCicloAsync();

        Assert.Equal(3, gravados);
        foreach (var veiculo in new[] { emRota, parado, manutencao })
        {
            var registros = await LerTelemetriaAsync(veiculo.Id);
            Assert.Single(registros);
            Assert.Equal(InstanteDoPrimeiroCiclo, registros[0].RecordedAt);
        }

        // Quem está parado: velocidade 0, posição e combustível constantes.
        foreach (var antes in new[] { parado, manutencao })
        {
            var depois = await LerVeiculoAsync(antes.Id);
            var registro = (await LerTelemetriaAsync(antes.Id)).Single();
            Assert.Equal(0, depois.Speed);
            Assert.Equal(antes.Latitude, depois.Latitude);
            Assert.Equal(antes.Longitude, depois.Longitude);
            Assert.Equal(antes.FuelLevel, depois.FuelLevel);
            Assert.Equal(0, registro.Speed);
            Assert.Equal(antes.Latitude, registro.Latitude);
            Assert.Equal(antes.Longitude, registro.Longitude);
            Assert.Equal(antes.FuelLevel, registro.FuelLevel);
            Assert.Equal(InstanteDoPrimeiroCiclo, depois.UpdatedAt);
        }
    }

    [Fact]
    public async Task Veiculo_em_rota_anda_500_m_ao_longo_da_rota_da_entrega_e_a_telemetria_acompanha()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("BBB-0001", "em_rota", rota.Inicio, combustivel: 61);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();

        await NovoJob(servicos, new RelogioManual(Inicio)).ExecutarCicloAsync();

        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Equal(60, depois.Speed);
        Assert.Equal(61, depois.FuelLevel); // consumo é da T-97
        Assert.Equal(500, rota.Projetar(new Ponto(depois.Longitude!.Value, depois.Latitude!.Value)), precision: 0);
        Assert.InRange(Metros(rota.Inicio, depois.Latitude!.Value, depois.Longitude!.Value), 495, 505);

        var registro = (await LerTelemetriaAsync(veiculo.Id)).Single();
        Assert.Equal(depois.Latitude, registro.Latitude);
        Assert.Equal(depois.Longitude, registro.Longitude);
        Assert.Equal(60, registro.Speed);
        Assert.Equal(61, registro.FuelLevel);
    }

    [Fact]
    public async Task Ciclos_seguidos_continuam_de_onde_o_veiculo_parou_sem_salto()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("BBB-0002", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();
        var relogio = new RelogioManual(Inicio);
        var job = NovoJob(servicos, relogio);

        for (var i = 0; i < 5; i++)
        {
            await job.ExecutarCicloAsync();
            relogio.Avancar(SimulacaoJob.Intervalo);
        }

        var registros = await LerTelemetriaAsync(veiculo.Id);
        Assert.Equal(5, registros.Count);
        Assert.Equal(
            [0, 30, 60, 90, 120],
            registros.Select(r => (int)(r.RecordedAt - InstanteDoPrimeiroCiclo).TotalSeconds));

        var anterior = rota.Inicio;
        foreach (var r in registros)
        {
            var passo = Metros(anterior, r.Latitude, r.Longitude);
            Assert.InRange(passo, 495, 505);
            anterior = new Ponto(r.Longitude, r.Latitude);
        }
        Assert.InRange(rota.Projetar(anterior), 2_490, 2_510);
    }

    [Fact]
    public async Task Veiculo_em_rota_sem_entrega_com_rota_fica_parado_e_nenhuma_posicao_e_inventada()
    {
        var posicao = new Ponto(-47.8208, -21.1767);
        var semEntrega = await CriarVeiculoAsync("CCC-0001", "em_rota", posicao, velocidade: 80);
        var entregaSemRota = await CriarVeiculoAsync("CCC-0002", "em_rota", posicao, velocidade: 80);
        await CriarEntregaAsync(entregaSemRota.Id, "em_transito", rotaGeoJson: null);
        var soPendente = await CriarVeiculoAsync("CCC-0003", "em_rota", posicao, velocidade: 80);
        await CriarEntregaAsync(soPendente.Id, "pendente", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        var rotaIlegivel = await CriarVeiculoAsync("CCC-0004", "em_rota", posicao, velocidade: 80);
        await CriarEntregaAsync(rotaIlegivel.Id, "em_transito", """{"type":"LineString","coordinates":[[-46,-23]]}""");
        using var servicos = Servicos();

        var gravados = await NovoJob(servicos, new RelogioManual(Inicio)).ExecutarCicloAsync();

        Assert.Equal(4, gravados);
        foreach (var antes in new[] { semEntrega, entregaSemRota, soPendente, rotaIlegivel })
        {
            var depois = await LerVeiculoAsync(antes.Id);
            var registro = (await LerTelemetriaAsync(antes.Id)).Single();
            Assert.Equal(0, depois.Speed);
            Assert.Equal(posicao.Latitude, depois.Latitude);
            Assert.Equal(posicao.Longitude, depois.Longitude);
            Assert.Equal(0, registro.Speed);
            Assert.Equal(posicao.Latitude, registro.Latitude);
            Assert.Equal(posicao.Longitude, registro.Longitude);
        }
    }

    [Fact]
    public async Task Usa_a_rota_da_entrega_em_andamento_mais_recente_do_veiculo()
    {
        var rotaCurta = """{"type":"LineString","coordinates":[[-46.0,-23.0],[-46.0,-23.1]]}""";
        var veiculo = await CriarVeiculoAsync("DDD-0001", "em_rota", new Ponto(-46.0, -23.0));
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson, idade: TimeSpan.FromHours(5));
        await CriarEntregaAsync(veiculo.Id, "em_transito", rotaCurta, idade: TimeSpan.FromHours(1));
        using var servicos = Servicos();

        await NovoJob(servicos, new RelogioManual(Inicio)).ExecutarCicloAsync();

        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Equal(-46.0, depois.Longitude!.Value, precision: 9); // andou para o sul, pela rota curta
        Assert.True(depois.Latitude < -23.0);
    }

    [Fact]
    public async Task Repetir_o_ciclo_no_mesmo_instante_nao_duplica_registro_nem_move_o_veiculo_de_novo()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("EEE-0001", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();
        var relogio = new RelogioManual(Inicio);
        var job = NovoJob(servicos, relogio);

        Assert.Equal(1, await job.ExecutarCicloAsync());
        var depoisDoPrimeiro = await LerVeiculoAsync(veiculo.Id);

        relogio.Avancar(TimeSpan.FromSeconds(5)); // ainda dentro do mesmo múltiplo de 30 s
        Assert.Equal(0, await job.ExecutarCicloAsync());

        Assert.Single(await LerTelemetriaAsync(veiculo.Id));
        var depoisDaRepeticao = await LerVeiculoAsync(veiculo.Id);
        Assert.Equal(depoisDoPrimeiro.Latitude, depoisDaRepeticao.Latitude);
        Assert.Equal(depoisDoPrimeiro.Longitude, depoisDaRepeticao.Longitude);
    }

    [Fact]
    public async Task Dois_ciclos_ao_mesmo_tempo_gravam_cada_veiculo_uma_vez_so()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("FFF-0001", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        await CriarVeiculoAsync("FFF-0002", "parado", new Ponto(-49.2733, -25.4284));
        using var servicos = Servicos();
        var relogio = new RelogioManual(Inicio);

        var totais = await Task.WhenAll(
            NovoJob(servicos, relogio).ExecutarCicloAsync(),
            NovoJob(servicos, relogio).ExecutarCicloAsync(),
            NovoJob(servicos, relogio).ExecutarCicloAsync());

        Assert.Equal(2, totais.Sum());
        Assert.Equal(2, await ContarTelemetriaAsync());
        Assert.InRange(Metros(rota.Inicio, (await LerVeiculoAsync(veiculo.Id)).Latitude!.Value, (await LerVeiculoAsync(veiculo.Id)).Longitude!.Value), 495, 505);
    }

    [Fact]
    public async Task Ciclo_pula_a_vez_quando_outra_instancia_detem_o_lock()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("GGG-0001", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();
        var job = NovoJob(servicos, new RelogioManual(Inicio));

        await using (var outra = new NpgsqlConnection(ApiFactory.ConexaoDeTeste))
        {
            await outra.OpenAsync();
            await using var transacao = await outra.BeginTransactionAsync();
            await using var comando = new NpgsqlCommand($"SELECT pg_advisory_xact_lock({SimulacaoJob.ChaveLock})", outra, transacao);
            await comando.ExecuteNonQueryAsync();

            Assert.Equal(0, await job.ExecutarCicloAsync());
            Assert.Empty(await LerTelemetriaAsync(veiculo.Id));
            Assert.Equal(0, (await LerVeiculoAsync(veiculo.Id)).Speed);
        } // fecha a conexão e solta o lock

        Assert.Equal(1, await job.ExecutarCicloAsync());
    }

    [Fact]
    public async Task Veiculo_chega_ao_destino_para_com_velocidade_zero_e_continua_registrado()
    {
        var rota = RotaSpRj;
        var quaseNoFim = rota.Interpolar(rota.ComprimentoEmMetros - 100);
        var veiculo = await CriarVeiculoAsync("HHH-0001", "em_rota", quaseNoFim, velocidade: 60);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();
        var relogio = new RelogioManual(Inicio);
        var job = NovoJob(servicos, relogio);

        await job.ExecutarCicloAsync();
        relogio.Avancar(SimulacaoJob.Intervalo);
        await job.ExecutarCicloAsync();

        var registros = await LerTelemetriaAsync(veiculo.Id);
        Assert.Equal(2, registros.Count);
        foreach (var r in registros)
        {
            Assert.Equal(0, r.Speed);
            Assert.Equal(rota.Fim.Latitude, r.Latitude);
            Assert.Equal(rota.Fim.Longitude, r.Longitude);
        }
    }

    [Fact]
    public void Alinha_o_instante_a_multiplos_de_30_s_em_UTC()
    {
        Assert.Equal(
            new DateTime(2026, 11, 1, 12, 0, 30, DateTimeKind.Utc),
            SimulacaoJob.Alinhar(new DateTime(2026, 11, 1, 12, 0, 59, 999, DateTimeKind.Utc)));
        Assert.Equal(
            new DateTime(2026, 11, 1, 12, 0, 30, DateTimeKind.Utc),
            SimulacaoJob.Alinhar(new DateTime(2026, 11, 1, 12, 0, 30, DateTimeKind.Utc)));
        Assert.Equal(DateTimeKind.Utc, SimulacaoJob.Alinhar(DateTime.UtcNow).Kind);
    }

    [Fact]
    public async Task Laco_do_job_roda_um_ciclo_ao_ligar_e_outro_a_cada_30_s_do_relogio()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("III-0001", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);
        using var servicos = Servicos();
        var relogio = new RelogioManual(Inicio);
        IHostedService job = NovoJob(servicos, relogio);

        await job.StartAsync(CancellationToken.None);
        try
        {
            await EsperarAsync(async () => await ContarTelemetriaAsync() == 1);

            relogio.Avancar(TimeSpan.FromSeconds(29));
            Assert.Equal(1, await ContarTelemetriaAsync()); // ainda não passou o intervalo

            relogio.Avancar(TimeSpan.FromSeconds(1));
            await EsperarAsync(async () => await ContarTelemetriaAsync() == 2);
        }
        finally
        {
            await job.StopAsync(CancellationToken.None);
        }

        var registros = await LerTelemetriaAsync(veiculo.Id);
        Assert.Equal(
            [InstanteDoPrimeiroCiclo, InstanteDoPrimeiroCiclo.AddSeconds(30)],
            registros.Select(r => r.RecordedAt));
    }

    [Fact]
    public async Task Com_a_semente_da_demo_os_veiculos_em_rota_andam_sem_salto_e_os_parados_nao_saem_do_lugar()
    {
        await using (var db = DbFixture.CriarContexto())
        {
            await SeedDemonstracao.ExecutarAsync(db);
        }
        List<Vehicle> antes;
        await using (var db = DbFixture.CriarContexto())
        {
            antes = await db.Vehicles.AsNoTracking().OrderBy(v => v.Plate).ToListAsync();
        }
        using var servicos = Servicos();
        // Bem depois do histórico semeado, para não colidir com os instantes dele.
        var relogio = new RelogioManual(new DateTimeOffset(DateTime.UtcNow.AddHours(2)));
        var job = NovoJob(servicos, relogio);

        Assert.Equal(antes.Count, await job.ExecutarCicloAsync());
        relogio.Avancar(SimulacaoJob.Intervalo);
        Assert.Equal(antes.Count, await job.ExecutarCicloAsync());

        var andaram = 0;
        foreach (var veiculo in antes)
        {
            var depois = await LerVeiculoAsync(veiculo.Id);
            var registros = await LerTelemetriaAsync(veiculo.Id);
            // Os registros do job são os dois últimos; antes deles vem o histórico semeado.
            var primeiro = registros[^2];
            var segundo = registros[^1];
            Assert.Equal(depois.Latitude, segundo.Latitude);
            Assert.Equal(depois.Longitude, segundo.Longitude);

            if (veiculo.Status == "em_rota")
            {
                andaram++;
                Assert.Equal(60, depois.Speed);
                // Entre dois ciclos, 500 m exatos pela rota: sem salto e sem ziguezague.
                Assert.InRange(Metros(new Ponto(primeiro.Longitude, primeiro.Latitude), segundo.Latitude, segundo.Longitude), 495, 505);
                // Todo veículo em rota nasce no primeiro ponto do corredor (T-36): o primeiro ciclo também anda
                // 500 m, sem o salto de encaixe que Ribeirão Preto e Salvador faziam (~1,2 km).
                Assert.InRange(Metros(new Ponto(veiculo.Longitude!.Value, veiculo.Latitude!.Value), primeiro.Latitude, primeiro.Longitude), 495, 505);
            }
            else
            {
                Assert.Equal(0, depois.Speed);
                Assert.Equal(veiculo.Latitude, depois.Latitude);
                Assert.Equal(veiculo.Longitude, depois.Longitude);
                Assert.Equal(0, segundo.Speed);
            }
        }
        Assert.Equal(antes.Count(v => v.Status == "em_rota"), andaram);
        Assert.True(andaram > 0);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("false", false)]
    [InlineData("1", false)]
    [InlineData("talvez", false)]
    [InlineData("true", true)]
    [InlineData("TRUE", true)]
    public void Modo_demo_so_liga_com_true_e_o_padrao_e_desligado(string? valor, bool esperado)
    {
        var configuracao = new ConfigurationBuilder()
            .AddInMemoryCollection(valor is null ? [] : [new(SimulacaoJob.ChaveConfiguracao, valor)])
            .Build();

        Assert.Equal(esperado, SimulacaoJob.Habilitado(configuracao));
    }

    [Fact]
    public async Task Com_o_modo_demo_desligado_o_job_nem_existe_e_nenhuma_posicao_muda()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("JJJ-0001", "em_rota", rota.Inicio, velocidade: 77);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);

        using var cliente = Banco.Factory.CreateClient();
        await cliente.GetAsync("/api/vehicles");

        Assert.Empty(Banco.Factory.Services.GetServices<IHostedService>().OfType<SimulacaoJob>());
        Assert.Empty(await LerTelemetriaAsync(veiculo.Id));
        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Equal(77, depois.Speed);
        Assert.Equal(rota.Inicio.Latitude, depois.Latitude);
    }

    [Fact]
    public async Task Com_FLEET_DEMO_MODE_true_o_job_e_registrado_e_roda_o_primeiro_ciclo_ao_subir()
    {
        var rota = RotaSpRj;
        var veiculo = await CriarVeiculoAsync("KKK-0001", "em_rota", rota.Inicio);
        await CriarEntregaAsync(veiculo.Id, "em_transito", Corredores.Obter("São Paulo, SP", "Rio de Janeiro, RJ").GeoJson);

        await using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.UseSetting(SimulacaoJob.ChaveConfiguracao, "true"));
        using var cliente = fabrica.CreateClient();

        Assert.Single(fabrica.Services.GetServices<IHostedService>().OfType<SimulacaoJob>());
        await EsperarAsync(async () => (await LerTelemetriaAsync(veiculo.Id)).Count == 1);
        Assert.Equal(60, (await LerVeiculoAsync(veiculo.Id)).Speed);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Endpoint_de_simulacao_nao_existe_e_responde_404(bool modoDemo)
    {
        await using var fabrica = Banco.Factory.WithWebHostBuilder(
            b => b.UseSetting(SimulacaoJob.ChaveConfiguracao, modoDemo ? "true" : "false"));
        using var cliente = fabrica.CreateClient();

        var post = await cliente.PostAsync("/api/telemetry/simulate", content: null);
        var get = await cliente.GetAsync("/api/telemetry/simulate");

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        // O roteamento do ASP.NET responde 405 a um POST em qualquer /api/telemetry/{x}, porque o GET por
        // id tem esse formato. Some junto com o controller (T-16). Aqui basta que nada seja aceito.
        Assert.True(post.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, post.StatusCode.ToString());
    }

    /// <summary>Espera uma condição que depende de trabalho em segundo plano, com teto de 15 s.</summary>
    private static async Task EsperarAsync(Func<Task<bool>> condicao)
    {
        var limite = DateTime.UtcNow.AddSeconds(15);
        while (!await condicao())
        {
            Assert.True(DateTime.UtcNow < limite, "a condição não se cumpriu a tempo");
            await Task.Delay(25);
        }
    }
}
