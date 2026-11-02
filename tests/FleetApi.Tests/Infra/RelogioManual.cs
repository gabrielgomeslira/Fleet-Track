namespace FleetApi.Tests.Infra;

/// <summary>
/// Relógio dos testes: só anda quando <see cref="Avancar"/> manda, e dispara os temporizadores
/// (<c>PeriodicTimer</c> inclusive) no instante certo. Sem <c>sleep</c> e sem pacote novo.
/// </summary>
public sealed class RelogioManual(DateTimeOffset inicio) : TimeProvider
{
    private readonly object _trava = new();
    private readonly List<Temporizador> _temporizadores = [];
    private DateTimeOffset _agora = inicio;

    public override DateTimeOffset GetUtcNow()
    {
        lock (_trava)
        {
            return _agora;
        }
    }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var temporizador = new Temporizador(this, callback, state);
        lock (_trava)
        {
            _temporizadores.Add(temporizador);
            temporizador.Programar(_agora, dueTime, period);
        }
        return temporizador;
    }

    public void Avancar(TimeSpan quanto)
    {
        lock (_trava)
        {
            var alvo = _agora + quanto;
            while (true)
            {
                var proximo = _temporizadores
                    .Where(t => t.Proximo is not null && t.Proximo <= alvo)
                    .OrderBy(t => t.Proximo)
                    .FirstOrDefault();
                if (proximo is null)
                {
                    break;
                }

                _agora = proximo.Proximo!.Value;
                proximo.Disparar();
            }
            _agora = alvo;
        }
    }

    private sealed class Temporizador(RelogioManual relogio, TimerCallback callback, object? state) : ITimer
    {
        private TimeSpan _periodo = Timeout.InfiniteTimeSpan;

        public DateTimeOffset? Proximo { get; private set; }

        public void Programar(DateTimeOffset agora, TimeSpan vencimento, TimeSpan periodo)
        {
            _periodo = periodo;
            Proximo = vencimento == Timeout.InfiniteTimeSpan ? null : agora + vencimento;
        }

        public void Disparar()
        {
            Proximo = _periodo == Timeout.InfiniteTimeSpan || _periodo == TimeSpan.Zero ? null : Proximo + _periodo;
            callback(state);
        }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            lock (relogio._trava)
            {
                Programar(relogio._agora, dueTime, period);
            }
            return true;
        }

        public void Dispose()
        {
            lock (relogio._trava)
            {
                Proximo = null;
                relogio._temporizadores.Remove(this);
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
