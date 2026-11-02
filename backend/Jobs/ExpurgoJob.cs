using FleetApi.Data;
using FleetApi.Infra;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Jobs;

/// <summary>Quantos itens um ciclo do expurgo removeu ou alterou.</summary>
public readonly record struct ResultadoExpurgo(int RegistrosRemovidos, int PosicoesExpiradas);

/// <summary>
/// Apaga a telemetria além do prazo de retenção (H-12), de hora em hora e já na subida. Um único
/// expurgo por banco: o lock consultivo de sessão faz quem não o obtém pular a vez.
/// </summary>
/// <remarks>
/// Fora da demo, o veículo cujo último sinal (<c>last_signal_at</c>) passou do prazo perde latitude,
/// longitude e velocidade, mas mantém <c>last_signal_at</c> e o combustível (ADR-0017). Na demo o último registro de cada veículo
/// é preservado e nenhuma posição é zerada (o dado é fictício e a demo não pode esvaziar). O log traz
/// só as quantidades: nunca placa, motorista, posição ou id.
/// </remarks>
public sealed class ExpurgoJob(
    IServiceScopeFactory escopos, TimeProvider relogio, Retencao retencao, IConfiguration configuracao,
    ILogger<ExpurgoJob> log) : BackgroundService
{
    public static readonly TimeSpan Intervalo = TimeSpan.FromHours(1);

    /// <summary>Linhas por DELETE: lotes curtos seguram o lock de linha por pouco tempo.</summary>
    public const int LoteDeExclusao = 5_000;

    // Valor distinto dos locks do seed e da simulação.
    public const long ChaveLock = 0x464C454554455850; // "FLEETEXP"

    private readonly bool _modoDemo = SimulacaoJob.Habilitado(configuracao);

    protected override async Task ExecuteAsync(CancellationToken parada)
    {
        using var temporizador = new PeriodicTimer(Intervalo, relogio);
        do
        {
            try
            {
                await ExecutarCicloAsync(retencao.Prazo, _modoDemo, ct: parada);
            }
            catch (OperationCanceledException) when (parada.IsCancellationRequested)
            {
                break;
            }
            catch (Exception erro)
            {
                // Um ciclo ruim não derruba o job nem a API: a próxima hora tenta de novo.
                log.LogError(erro, "Falha no expurgo de telemetria; o proximo ciclo tenta de novo.");
            }
        }
        while (await ProximoTiqueAsync(temporizador, parada));
    }

    /// <summary>
    /// Um ciclo com o prazo e o modo dados. O corte é "agora − prazo": registro com <c>recorded_at</c>
    /// anterior a ele é removido. Repetir o ciclo não remove mais nada.
    /// </summary>
    /// <returns>As quantidades; zeradas se outra instância tem o lock.</returns>
    public async Task<ResultadoExpurgo> ExecutarCicloAsync(
        TimeSpan prazo, bool modoDemo, int lote = LoteDeExclusao, CancellationToken ct = default)
    {
        var corte = relogio.GetUtcNow().UtcDateTime - prazo;

        await using var escopo = escopos.CreateAsyncScope();
        var db = escopo.ServiceProvider.GetRequiredService<AppDbContext>();

        // O lock é da sessão: precisa da mesma conexão do começo ao fim, e é solto antes de devolvê-la.
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            var ficouComOLock = await db.Database
                .SqlQuery<bool>($"SELECT pg_try_advisory_lock({ChaveLock}) AS \"Value\"")
                .SingleAsync(ct);
            if (!ficouComOLock)
            {
                return default;
            }

            try
            {
                var removidos = await RemoverRegistrosAsync(db, corte, modoDemo, lote, ct);
                var posicoes = modoDemo ? 0 : await ExpirarPosicoesAsync(db, corte, ct);

                log.LogInformation(
                    "Expurgo de telemetria: {Removidos} registro(s) removido(s), {Posicoes} posicao(oes) expirada(s); retencao de {Horas} h.",
                    removidos, posicoes, prazo.TotalHours);
                return new ResultadoExpurgo(removidos, posicoes);
            }
            finally
            {
                await db.Database
                    .SqlQuery<bool>($"SELECT pg_advisory_unlock({ChaveLock}) AS \"Value\"")
                    .SingleAsync(CancellationToken.None);
            }
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private static async Task<int> RemoverRegistrosAsync(
        AppDbContext db, DateTime corte, bool modoDemo, int lote, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            // Na demo só sai o registro que tem outro mais novo do mesmo veículo: o último fica.
            var removidos = modoDemo
                ? await db.Database.ExecuteSqlAsync($"""
                    DELETE FROM telemetry_records
                    WHERE id IN (
                        SELECT t.id FROM telemetry_records t
                        WHERE t.recorded_at < {corte}
                          AND EXISTS (SELECT 1 FROM telemetry_records n
                                      WHERE n.vehicle_id = t.vehicle_id AND n.recorded_at > t.recorded_at)
                        LIMIT {lote})
                    """, ct)
                : await db.Database.ExecuteSqlAsync($"""
                    DELETE FROM telemetry_records
                    WHERE id IN (SELECT id FROM telemetry_records WHERE recorded_at < {corte} LIMIT {lote})
                    """, ct);

            total += removidos;
            if (removidos < lote)
            {
                return total;
            }
        }
    }

    /// <summary>
    /// Anula posição e velocidade de quem tem o último sinal além do corte (o mesmo corte do DELETE,
    /// ADR-0017). O corte é por <c>last_signal_at</c>, sem subconsulta por veículo. O instante do sinal
    /// e o combustível não são tocados: combustível não é localização e o alerta usa a idade do sinal.
    /// </summary>
    private static Task<int> ExpirarPosicoesAsync(AppDbContext db, DateTime corte, CancellationToken ct) =>
        db.Database.ExecuteSqlAsync($"""
            UPDATE vehicles SET latitude = NULL, longitude = NULL, speed = NULL
            WHERE last_signal_at < {corte}
              AND (latitude IS NOT NULL OR longitude IS NOT NULL OR speed IS NOT NULL)
            """, ct);

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
