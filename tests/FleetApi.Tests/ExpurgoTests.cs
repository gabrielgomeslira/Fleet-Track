using System.Text.Json;
using FleetApi.Data;
using FleetApi.Infra;
using FleetApi.Jobs;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// T-42 (H-12): o ciclo do expurgo contra o Postgres real, com relógio manual. Nada espera tempo
/// passar: o "agora" do ciclo vem do <see cref="RelogioManual"/>.
/// </summary>
public sealed class ExpurgoTests(DbFixture banco) : TesteComBanco(banco)
{
    private static readonly DateTimeOffset Agora = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Dia = TimeSpan.FromHours(24);

    private static DateTime Atras(TimeSpan quanto) => Agora.UtcDateTime - quanto;

    private static ServiceProvider Servicos() =>
        new ServiceCollection()
            .AddDbContext<AppDbContext>(o => o.UseNpgsql(ApiFactory.ConexaoDeTeste))
            .BuildServiceProvider();

    private static ExpurgoJob NovoJob(ServiceProvider servicos, bool modoDemo = false, CapturaLog? captura = null) =>
        new(servicos.GetRequiredService<IServiceScopeFactory>(),
            new RelogioManual(Agora),
            new Retencao(Dia),
            new ConfigurationBuilder()
                .AddInMemoryCollection(modoDemo ? [new("FLEET_DEMO_MODE", "true")] : [])
                .Build(),
            new CapturaLog<ExpurgoJob>(captura ?? new CapturaLog()));

    private static async Task<Vehicle> CriarVeiculoAsync(
        string placa, double? latitude = -23.55, double? longitude = -46.63,
        DateTime? ultimoSinal = null)
    {
        await using var db = DbFixture.CriarContexto();
        var comPosicao = latitude is not null;
        var veiculo = new Vehicle
        {
            Id = Guid.NewGuid(), Plate = placa, Model = "Modelo", DriverName = "Motorista Ficticio", Status = "em_rota",
            // Sem posição, sem velocidade (como o expurgo deixa); o combustível sobrevive.
            Latitude = latitude, Longitude = longitude, Speed = comPosicao ? 40 : null, FuelLevel = 70,
            UpdatedAt = ultimoSinal ?? Atras(TimeSpan.FromMinutes(1)),
            // O CHECK do banco exige sinal para quem tem posição (ADR-0017).
            LastSignalAt = ultimoSinal ?? (comPosicao ? Atras(TimeSpan.FromMinutes(1)) : null),
        };
        db.Vehicles.Add(veiculo);
        await db.SaveChangesAsync();
        return veiculo;
    }

    private static async Task RegistrarAsync(Guid veiculoId, params DateTime[] instantes)
    {
        await using var db = DbFixture.CriarContexto();
        foreach (var instante in instantes)
        {
            db.TelemetryRecords.Add(new TelemetryRecord
            {
                VehicleId = veiculoId, Latitude = -23.55, Longitude = -46.63, Speed = 40, FuelLevel = 70, RecordedAt = instante,
            });
        }
        await db.SaveChangesAsync();
    }

    private static async Task<List<DateTime>> InstantesAsync(Guid veiculoId)
    {
        await using var db = DbFixture.CriarContexto();
        return await db.TelemetryRecords.AsNoTracking().Where(t => t.VehicleId == veiculoId)
            .OrderBy(t => t.RecordedAt).Select(t => t.RecordedAt).ToListAsync();
    }

    private static async Task<Vehicle> LerVeiculoAsync(Guid id)
    {
        await using var db = DbFixture.CriarContexto();
        return await db.Vehicles.AsNoTracking().SingleAsync(v => v.Id == id);
    }

    [Fact]
    public async Task Registro_alem_do_prazo_e_removido_e_o_que_esta_no_prazo_fica()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0001", ultimoSinal: Atras(TimeSpan.FromMinutes(1)));
        await RegistrarAsync(veiculo.Id,
            Atras(Dia + TimeSpan.FromHours(6)), Atras(Dia + TimeSpan.FromSeconds(1)), Atras(Dia), Atras(TimeSpan.FromHours(1)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(2, resultado.RegistrosRemovidos);
        // No limite exato (agora − 24 h) o registro ainda vale: só sai o que é anterior ao corte.
        Assert.Equal([Atras(Dia), Atras(TimeSpan.FromHours(1))], await InstantesAsync(veiculo.Id));
    }

    [Fact]
    public async Task Prazo_alterado_e_respeitado()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0002", ultimoSinal: Atras(TimeSpan.FromMinutes(1)));
        await RegistrarAsync(veiculo.Id,
            Atras(TimeSpan.FromHours(30)), Atras(TimeSpan.FromHours(3)), Atras(TimeSpan.FromMinutes(90)), Atras(TimeSpan.FromMinutes(1)));
        using var servicos = Servicos();
        var job = NovoJob(servicos);

        Assert.Equal(0, (await job.ExecutarCicloAsync(TimeSpan.FromHours(48), false)).RegistrosRemovidos);
        Assert.Equal(4, (await InstantesAsync(veiculo.Id)).Count);

        Assert.Equal(1, (await job.ExecutarCicloAsync(TimeSpan.FromHours(24), false)).RegistrosRemovidos);
        Assert.Equal(3, (await InstantesAsync(veiculo.Id)).Count);

        Assert.Equal(1, (await job.ExecutarCicloAsync(TimeSpan.FromHours(2), false)).RegistrosRemovidos);
        Assert.Equal(2, (await InstantesAsync(veiculo.Id)).Count);

        Assert.Equal(1, (await job.ExecutarCicloAsync(TimeSpan.FromMinutes(10), false)).RegistrosRemovidos);
        Assert.Equal([Atras(TimeSpan.FromMinutes(1))], await InstantesAsync(veiculo.Id));
    }

    [Fact]
    public async Task Veiculo_que_fica_sem_registro_perde_a_posicao_e_guarda_o_instante_do_ultimo_sinal()
    {
        var sinal = Atras(TimeSpan.FromHours(30));
        var veiculo = await CriarVeiculoAsync("EXP-0003", -22.9, -43.1, ultimoSinal: sinal);
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromHours(31)), sinal);
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(new ResultadoExpurgo(RegistrosRemovidos: 2, PosicoesExpiradas: 1), resultado);
        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Null(depois.Latitude);
        Assert.Null(depois.Longitude);
        Assert.Equal(sinal, depois.LastSignalAt);
        // A velocidade vai junto com a posição; o combustível fica (não é localização).
        Assert.Null(depois.Speed);
        Assert.Equal(70, depois.FuelLevel);
        // O resto da linha não muda: placa, status e a data de atualização.
        Assert.Equal("EXP-0003", depois.Plate);
        Assert.Equal(veiculo.UpdatedAt, depois.UpdatedAt);
    }

    [Fact]
    public async Task Veiculo_com_registro_dentro_do_prazo_mantem_a_posicao()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0004", -22.9, -43.1, ultimoSinal: Atras(TimeSpan.FromMinutes(5)));
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromHours(40)), Atras(TimeSpan.FromMinutes(5)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(new ResultadoExpurgo(1, 0), resultado);
        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Equal((-22.9, -43.1), (depois.Latitude, depois.Longitude));
    }

    [Fact]
    public async Task Veiculo_sem_registro_mas_com_sinal_recente_mantem_a_posicao()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0005", -22.9, -43.1, ultimoSinal: Atras(TimeSpan.FromHours(2)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(default, resultado);
        Assert.Equal(-22.9, (await LerVeiculoAsync(veiculo.Id)).Latitude);
    }

    [Fact]
    public async Task Veiculo_que_nunca_enviou_sinal_nao_e_tocado_pelo_expurgo()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0006", latitude: null, longitude: null);
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(default, resultado);
        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Null(depois.LastSignalAt); // o expurgo não inventa um sinal que ninguém registrou
        Assert.Equal(70, depois.FuelLevel);
    }

    [Fact]
    public async Task Corte_e_pelo_last_signal_at_e_nao_pela_ausencia_de_registro()
    {
        var antigo = await CriarVeiculoAsync("EXP-0012", -22.9, -43.1, ultimoSinal: Atras(TimeSpan.FromHours(30)));
        var recente = await CriarVeiculoAsync("EXP-0013", -22.8, -43.0, ultimoSinal: Atras(TimeSpan.FromHours(1)));
        // Os dois ainda têm registros; só o corte do sinal decide quem perde a posição.
        await RegistrarAsync(antigo.Id, Atras(TimeSpan.FromHours(2)));
        await RegistrarAsync(recente.Id, Atras(TimeSpan.FromHours(1)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(new ResultadoExpurgo(0, 1), resultado);
        Assert.Null((await LerVeiculoAsync(antigo.Id)).Latitude);
        Assert.Equal(-22.8, (await LerVeiculoAsync(recente.Id)).Latitude);
    }

    [Fact]
    public async Task Veiculo_ja_sem_posicao_nao_e_contado_de_novo()
    {
        await CriarVeiculoAsync("EXP-0007", latitude: null, longitude: null, ultimoSinal: Atras(TimeSpan.FromHours(50)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        Assert.Equal(default, resultado);
    }

    [Fact]
    public async Task Na_demo_o_ultimo_registro_de_cada_veiculo_e_preservado_e_a_posicao_nao_e_zerada()
    {
        var comHistoricoVelho = await CriarVeiculoAsync("DEM-0001", ultimoSinal: Atras(TimeSpan.FromDays(5)));
        await RegistrarAsync(comHistoricoVelho.Id,
            Atras(TimeSpan.FromDays(7)), Atras(TimeSpan.FromDays(6)), Atras(TimeSpan.FromDays(5)));
        var misto = await CriarVeiculoAsync("DEM-0002", ultimoSinal: Atras(TimeSpan.FromMinutes(1)));
        await RegistrarAsync(misto.Id, Atras(TimeSpan.FromDays(3)), Atras(TimeSpan.FromHours(2)), Atras(TimeSpan.FromMinutes(1)));
        var semRegistro = await CriarVeiculoAsync("DEM-0003", -22.9, -43.1, ultimoSinal: Atras(TimeSpan.FromDays(5)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos, modoDemo: true).ExecutarCicloAsync(Dia, modoDemo: true);

        Assert.Equal(new ResultadoExpurgo(RegistrosRemovidos: 3, PosicoesExpiradas: 0), resultado);
        Assert.Equal([Atras(TimeSpan.FromDays(5))], await InstantesAsync(comHistoricoVelho.Id));
        Assert.Equal([Atras(TimeSpan.FromHours(2)), Atras(TimeSpan.FromMinutes(1))], await InstantesAsync(misto.Id));
        Assert.Equal(-23.55, (await LerVeiculoAsync(comHistoricoVelho.Id)).Latitude);
        Assert.Equal(-22.9, (await LerVeiculoAsync(semRegistro.Id)).Latitude);
    }

    [Fact]
    public async Task Na_demo_repetir_o_ciclo_nao_remove_o_que_sobrou()
    {
        var veiculo = await CriarVeiculoAsync("DEM-0004");
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromDays(9)), Atras(TimeSpan.FromDays(8)));
        using var servicos = Servicos();
        var job = NovoJob(servicos, modoDemo: true);

        Assert.Equal(1, (await job.ExecutarCicloAsync(Dia, true)).RegistrosRemovidos);
        Assert.Equal(0, (await job.ExecutarCicloAsync(Dia, true)).RegistrosRemovidos);
        Assert.Equal([Atras(TimeSpan.FromDays(8))], await InstantesAsync(veiculo.Id));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Remove_em_lotes_ate_acabar(bool modoDemo)
    {
        var veiculo = await CriarVeiculoAsync("EXP-0008");
        // 7 vencidos (e, na demo, mais 1 que fica por ser o último) em lotes de 2: 4 DELETEs.
        var vencidos = Enumerable.Range(1, 7).Select(i => Atras(Dia + TimeSpan.FromMinutes(i))).ToArray();
        await RegistrarAsync(veiculo.Id, vencidos);
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromMinutes(1)));
        using var servicos = Servicos();

        var resultado = await NovoJob(servicos, modoDemo).ExecutarCicloAsync(Dia, modoDemo, lote: 2);

        Assert.Equal(7, resultado.RegistrosRemovidos);
        Assert.Equal([Atras(TimeSpan.FromMinutes(1))], await InstantesAsync(veiculo.Id));
    }

    [Fact]
    public async Task Com_outra_instancia_no_lock_o_ciclo_nao_apaga_nada()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0009", ultimoSinal: Atras(TimeSpan.FromHours(50)));
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromHours(50)));
        using var servicos = Servicos();
        await using var outra = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await outra.OpenAsync();
        await using (var pega = new NpgsqlCommand($"SELECT pg_advisory_lock({ExpurgoJob.ChaveLock})", outra))
        {
            await pega.ExecuteNonQueryAsync();
        }

        var enquantoOutraSegura = await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);
        await using (var solta = new NpgsqlCommand($"SELECT pg_advisory_unlock({ExpurgoJob.ChaveLock})", outra))
        {
            await solta.ExecuteNonQueryAsync();
        }

        Assert.Equal(default, enquantoOutraSegura);
        Assert.Single(await InstantesAsync(veiculo.Id));
        Assert.Equal(1, (await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false)).RegistrosRemovidos);
    }

    [Fact]
    public async Task O_ciclo_solta_o_lock_ao_terminar()
    {
        using var servicos = Servicos();
        await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);

        await using var outra = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await outra.OpenAsync();
        await using var tenta = new NpgsqlCommand($"SELECT pg_try_advisory_lock({ExpurgoJob.ChaveLock})", outra);
        Assert.True((bool)(await tenta.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task O_log_traz_so_a_quantidade_removida_sem_dado_do_veiculo()
    {
        var veiculo = await CriarVeiculoAsync("SEG-9X99", -12.3456, -45.6789, ultimoSinal: Atras(TimeSpan.FromHours(50)));
        await RegistrarAsync(veiculo.Id, Atras(TimeSpan.FromHours(50)), Atras(TimeSpan.FromHours(51)), Atras(TimeSpan.FromHours(52)));
        var captura = new CapturaLog();
        using var servicos = Servicos();

        await NovoJob(servicos, captura: captura).ExecutarCicloAsync(Dia, modoDemo: false);

        var (nivel, mensagem) = Assert.Single(captura.Mensagens);
        Assert.Equal(LogLevel.Information, nivel);
        Assert.Contains("3 registro(s) removido(s)", mensagem);
        Assert.Contains("1 posicao(oes) expirada(s)", mensagem);
        Assert.DoesNotContain("SEG-9X99", mensagem);
        Assert.DoesNotContain(veiculo.Id.ToString(), mensagem);
        Assert.DoesNotContain("12,3456", mensagem);
        Assert.DoesNotContain("12.3456", mensagem);
        Assert.DoesNotContain("Motorista", mensagem);
    }

    [Fact]
    public async Task Api_devolve_posicao_nula_para_quem_perdeu_a_posicao_e_mantem_o_veiculo()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0010", ultimoSinal: Atras(TimeSpan.FromHours(50)));
        using var servicos = Servicos();
        await NovoJob(servicos).ExecutarCicloAsync(Dia, modoDemo: false);
        using var cliente = Banco.Factory.CreateClient();

        var lista = JsonDocument.Parse(await cliente.GetStringAsync("/api/vehicles")).RootElement;
        var detalhe = JsonDocument.Parse(await cliente.GetStringAsync($"/api/vehicles/{veiculo.Id}")).RootElement;

        var item = Assert.Single(lista.EnumerateArray());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("latitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("longitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("speed").ValueKind);
        Assert.Equal(70, item.GetProperty("fuelLevel").GetInt32());
        Assert.Equal("EXP-0010", item.GetProperty("plate").GetString());
        Assert.Equal(JsonValueKind.Null, detalhe.GetProperty("latitude").ValueKind);
        Assert.Equal(JsonValueKind.Null, detalhe.GetProperty("longitude").ValueKind);
    }

    [Fact]
    public async Task Simulacao_nao_inventa_posicao_para_quem_perdeu_a_dele()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0011", latitude: null, longitude: null, ultimoSinal: Atras(TimeSpan.FromHours(50)));
        using var servicos = Servicos();
        var simulacao = new SimulacaoJob(
            servicos.GetRequiredService<IServiceScopeFactory>(), new RelogioManual(Agora),
            new CapturaLog<SimulacaoJob>(new CapturaLog()));

        var gravados = await simulacao.ExecutarCicloAsync();

        Assert.Equal(0, gravados);
        Assert.Empty(await InstantesAsync(veiculo.Id));
        var depois = await LerVeiculoAsync(veiculo.Id);
        Assert.Null(depois.Latitude);
        Assert.Equal(Atras(TimeSpan.FromHours(50)), depois.LastSignalAt);
    }

    [Fact]
    public async Task Subida_da_api_registra_o_expurgo_e_ele_ja_roda_no_primeiro_ciclo()
    {
        var veiculo = await CriarVeiculoAsync("EXP-0012", ultimoSinal: DateTime.UtcNow);
        await RegistrarAsync(veiculo.Id, DateTime.UtcNow.AddHours(-48), DateTime.UtcNow.AddHours(-1));

        await using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.UseSetting(ApiFactory.MantemExpurgo, "true"));
        using var cliente = fabrica.CreateClient();

        Assert.Single(fabrica.Services.GetServices<IHostedService>().OfType<ExpurgoJob>());
        var limite = DateTime.UtcNow.AddSeconds(15);
        while ((await InstantesAsync(veiculo.Id)).Count != 1)
        {
            Assert.True(DateTime.UtcNow < limite, "o expurgo não rodou na subida");
            await Task.Delay(25);
        }
    }

    [Fact]
    public async Task Subida_com_retencao_abaixo_do_piso_avisa_no_log_e_sobe()
    {
        var captura = new CapturaLog();
        await using var fabrica = Banco.Factory.WithWebHostBuilder(b =>
        {
            b.UseSetting(Retencao.Variavel, "1");
            b.ConfigureLogging(l => l.AddProvider(captura));
        });
        using var cliente = fabrica.CreateClient();

        (await cliente.GetAsync("/api/vehicles")).EnsureSuccessStatusCode();

        Assert.Contains(captura.Mensagens, m => m.Nivel == LogLevel.Warning && m.Mensagem.Contains(Retencao.Variavel));
        Assert.Equal(TimeSpan.FromHours(1), fabrica.Services.GetRequiredService<Retencao>().Prazo);
    }

    [Fact]
    public async Task Subida_sem_a_variavel_usa_24_horas_e_nao_avisa()
    {
        var captura = new CapturaLog();
        await using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.ConfigureLogging(l => l.AddProvider(captura)));
        using var cliente = fabrica.CreateClient();

        (await cliente.GetAsync("/api/vehicles")).EnsureSuccessStatusCode();

        Assert.DoesNotContain(captura.Mensagens, m => m.Mensagem.Contains(Retencao.Variavel));
        Assert.Equal(TimeSpan.FromHours(24), fabrica.Services.GetRequiredService<Retencao>().Prazo);
    }
}
