using Microsoft.Extensions.Logging;

namespace FleetApi.Tests.Infra;

/// <summary>Guarda as mensagens já formatadas, para os testes conferirem o que foi (e o que não foi) logado.</summary>
public sealed class CapturaLog : ILoggerProvider, ILogger
{
    private readonly object _trava = new();
    private readonly List<(LogLevel Nivel, string Mensagem)> _mensagens = [];

    public IReadOnlyList<(LogLevel Nivel, string Mensagem)> Mensagens
    {
        get
        {
            lock (_trava)
            {
                return _mensagens.ToList();
            }
        }
    }

    public ILogger CreateLogger(string categoryName) => this;

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        var texto = formatter(state, exception) + (exception is null ? "" : " | " + exception);
        lock (_trava)
        {
            _mensagens.Add((logLevel, texto));
        }
    }

    public void Dispose()
    {
    }
}

/// <summary>Logger tipado sobre a mesma captura, para construir os jobs à mão.</summary>
public sealed class CapturaLog<T>(CapturaLog captura) : ILogger<T>
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        captura.Log(logLevel, eventId, state, exception, formatter);
}
