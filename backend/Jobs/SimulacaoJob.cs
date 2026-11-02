using FleetApi.Data;
using FleetApi.Demo;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Jobs;

/// <summary>
/// Move a frota no modo demo, ao longo do <c>route_path</c> da entrega em andamento (ADR-0007,
/// ADR-0016 item 14). Um único job por banco: o lock consultivo de cada ciclo pula a vez de quem
/// não o obtém. Não há sorteio: a posição depende só do estado anterior e da rota.
/// </summary>
public sealed class SimulacaoJob(
    IServiceScopeFactory escopos, TimeProvider relogio, ILogger<SimulacaoJob> log) : BackgroundService
{
    /// <summary>Intervalo entre ciclos. Constante no código, sem variável (D1 da seção 4.10, H-10).</summary>
    public static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(30);

    /// <summary>Variável que liga o job. Ausente ou diferente de "true" = desligado.</summary>
    public const string ChaveConfiguracao = "FLEET_DEMO_MODE";

    // Lock por ciclo, solto no fim da transação. Valor distinto do lock do seed.
    public const long ChaveLock = 0x464C454554534D49; // "FLEETSMI"

    public static bool Habilitado(IConfiguration configuracao) =>
        bool.TryParse(configuracao[ChaveConfiguracao], out var valor) && valor;

    protected override async Task ExecuteAsync(CancellationToken parada)
    {
        using var temporizador = new PeriodicTimer(Intervalo, relogio);
        do
        {
            try
            {
                var gravados = await ExecutarCicloAsync(parada);
                log.LogDebug("Ciclo da simulacao: {Gravados} registro(s) de telemetria.", gravados);
            }
            catch (OperationCanceledException) when (parada.IsCancellationRequested)
            {
                break;
            }
            catch (Exception erro)
            {
                // Um ciclo ruim (banco indisponível, por exemplo) não derruba o job: o próximo tenta de novo.
                log.LogError(erro, "Falha no ciclo da simulacao; o proximo ciclo tenta de novo.");
            }
        }
        while (await ProximoTiqueAsync(temporizador, parada));
    }

    /// <summary>
    /// Um ciclo: o instante é o do relógio alinhado a múltiplos de 30 s (UTC), e todos os veículos
    /// recebem um registro, inclusive os parados. Posição, velocidade, combustível e telemetria
    /// saem numa transação só. Repetir o ciclo no mesmo instante não muda nada.
    /// </summary>
    /// <returns>Registros de telemetria gravados (0 se outra instância tem o lock ou se o instante já foi gravado).</returns>
    public async Task<int> ExecutarCicloAsync(CancellationToken ct = default)
    {
        var instante = Alinhar(relogio.GetUtcNow().UtcDateTime);

        await using var escopo = escopos.CreateAsyncScope();
        var db = escopo.ServiceProvider.GetRequiredService<AppDbContext>();

        // A estratégia de retry do EF exige que a transação do usuário rode dentro dela.
        var estrategia = db.Database.CreateExecutionStrategy();
        return await estrategia.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transacao = await db.Database.BeginTransactionAsync(ct);

            var ficouComOLock = await db.Database
                .SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock({ChaveLock}) AS \"Value\"")
                .SingleAsync(ct);
            if (!ficouComOLock)
            {
                return 0;
            }

            var veiculos = await db.Vehicles.OrderBy(v => v.Id).ToListAsync(ct);
            var rotas = await CarregarRotasAsync(db, ct);

            var gravados = 0;
            foreach (var veiculo in veiculos)
            {
                // Posição expirada pelo expurgo (H-12): sem ponto de partida, nada a mover nem a gravar.
                if (veiculo.Latitude is not { } latitude || veiculo.Longitude is not { } longitude)
                {
                    continue;
                }

                // Só quem está em rota e tem entrega com rota anda. Nenhuma posição é inventada.
                var rota = veiculo.Status == "em_rota" && rotas.TryGetValue(veiculo.Id, out var r) ? r : null;
                var novo = MotorDemo.Avancar(
                    new EstadoVeiculo(latitude, longitude, veiculo.Speed, veiculo.FuelLevel),
                    rota,
                    Intervalo);

                // A unicidade (vehicle_id, recorded_at) é do banco: repetir o instante não insere
                // e, então, o veículo também não avança de novo.
                var inseridos = await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO telemetry_records (vehicle_id, latitude, longitude, speed, fuel_level, recorded_at)
                    VALUES ({veiculo.Id}, {novo.Latitude}, {novo.Longitude}, {novo.VelocidadeKmH}, {novo.Combustivel}, {instante})
                    ON CONFLICT (vehicle_id, recorded_at) DO NOTHING
                    """, ct);
                if (inseridos == 0)
                {
                    continue;
                }

                veiculo.Latitude = novo.Latitude;
                veiculo.Longitude = novo.Longitude;
                veiculo.Speed = novo.VelocidadeKmH;
                veiculo.FuelLevel = novo.Combustivel;
                veiculo.UpdatedAt = instante;
                veiculo.LastSignalAt = instante;
                gravados++;
            }

            await db.SaveChangesAsync(ct);
            await transacao.CommitAsync(ct);
            return gravados;
        });
    }

    /// <summary>Arredonda para baixo, ao múltiplo de <see cref="Intervalo"/> mais próximo (UTC).</summary>
    public static DateTime Alinhar(DateTime utc)
    {
        var passo = Intervalo.Ticks;
        var ticks = utc.ToUniversalTime().Ticks;
        return new DateTime(ticks - ticks % passo, DateTimeKind.Utc);
    }

    /// <summary>Rota da entrega em andamento mais recente de cada veículo. Rota ilegível = sem rota.</summary>
    private async Task<Dictionary<Guid, GeoRota>> CarregarRotasAsync(AppDbContext db, CancellationToken ct)
    {
        var entregas = await db.Deliveries
            .AsNoTracking()
            .Where(d => d.Status == "em_transito" && d.RoutePath != null)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new { d.Id, d.VehicleId, d.RoutePath })
            .ToListAsync(ct);

        var rotas = new Dictionary<Guid, GeoRota>();
        var vistos = new HashSet<Guid>();
        foreach (var entrega in entregas)
        {
            if (!vistos.Add(entrega.VehicleId))
            {
                continue; // só a mais recente de cada veículo vale, mesmo que a rota dela seja ilegível
            }

            if (GeoRota.DeGeoJson(entrega.RoutePath) is { } rota)
            {
                rotas[entrega.VehicleId] = rota;
            }
            else
            {
                // Sem o conteúdo da rota no log (ADR-0016 item 12).
                log.LogWarning("Entrega {EntregaId} em transito com route_path ilegivel; o veiculo fica parado.", entrega.Id);
            }
        }

        return rotas;
    }

    private static async Task<bool> ProximoTiqueAsync(PeriodicTimer temporizador, CancellationToken parada)
    {
        try
        {
            return await temporizador.WaitForNextTickAsync(parada);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
