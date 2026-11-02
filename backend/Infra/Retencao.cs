using System.Globalization;

namespace FleetApi.Infra;

/// <summary>
/// Prazo de retenção da telemetria (H-12), lido de <c>FLEET_TELEMETRY_RETENTION_HOURS</c>. Padrão de
/// 24 h. Valor ausente ou em branco = padrão; valor que não é número finito entre 0 (exclusive) e
/// <see cref="MaximoEmHoras"/> encerra a subida, sem ecoar o que foi informado. Abaixo do piso de 2 h
/// o valor é aceito, mas a subida avisa no log: a página do veículo (janela de 2 h) fica sem dados.
/// </summary>
public sealed record Retencao(TimeSpan Prazo)
{
    public const string Variavel = "FLEET_TELEMETRY_RETENTION_HOURS";

    /// <summary>Teto de 10 anos: acima disso o número é erro de digitação, e o TimeSpan estoura.</summary>
    public const double MaximoEmHoras = 24 * 365 * 10;

    public static readonly TimeSpan Padrao = TimeSpan.FromHours(24);
    public static readonly TimeSpan Piso = TimeSpan.FromHours(2);

    public bool AbaixoDoPiso => Prazo < Piso;

    public static Retencao Resolver(IConfiguration configuracao)
    {
        if (configuracao[Variavel] is not { } texto || string.IsNullOrWhiteSpace(texto))
        {
            return new Retencao(Padrao);
        }

        if (!double.TryParse(texto, NumberStyles.Float, CultureInfo.InvariantCulture, out var horas)
            || !double.IsFinite(horas) || horas <= 0 || horas > MaximoEmHoras)
        {
            // Não ecoa o valor informado.
            throw new ConfiguracaoInvalidaException(
                $"Variável inválida: {Variavel} deve ser um número de horas maior que 0 e até {MaximoEmHoras:0}");
        }

        return new Retencao(TimeSpan.FromHours(horas));
    }
}
