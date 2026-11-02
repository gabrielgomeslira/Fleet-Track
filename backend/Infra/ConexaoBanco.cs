using Npgsql;

namespace FleetApi.Infra;

/// <summary>Variáveis de ambiente obrigatórias ausentes ou inválidas. A mensagem nunca contém valores.</summary>
public sealed class ConfiguracaoInvalidaException(string mensagem) : Exception(mensagem);

/// <summary>
/// Monta a string de conexão com o Postgres a partir de POSTGRES_HOST/PORT/DB/USER/PASSWORD
/// (ADR-0011). ConnectionStrings__Default, se definida, tem precedência (testes e CI).
/// </summary>
public static class ConexaoBanco
{
    public const string VariavelHost = "POSTGRES_HOST";
    public const string VariavelPorta = "POSTGRES_PORT";
    public const string VariavelBanco = "POSTGRES_DB";
    public const string VariavelUsuario = "POSTGRES_USER";
    public const string VariavelSenha = "POSTGRES_PASSWORD";

    private const int PortaPadrao = 5432;

    private static readonly string[] Obrigatorias =
        [VariavelHost, VariavelBanco, VariavelUsuario, VariavelSenha];

    public static string Resolver(IConfiguration configuracao)
    {
        if (configuracao.GetConnectionString("Default") is { } explicita
            && !string.IsNullOrWhiteSpace(explicita))
        {
            return explicita;
        }

        string? Ler(string nome) => configuracao[nome] is { } v && !string.IsNullOrWhiteSpace(v) ? v : null;

        var ausentes = Obrigatorias.Where(nome => Ler(nome) is null).ToArray();
        if (ausentes.Length > 0)
        {
            throw new ConfiguracaoInvalidaException(
                $"Variáveis obrigatórias ausentes: {string.Join(", ", ausentes)}");
        }

        var porta = PortaPadrao;
        if (Ler(VariavelPorta) is { } textoPorta
            && !(int.TryParse(textoPorta, out porta) && porta is > 0 and <= 65535))
        {
            // Não ecoa o valor informado.
            throw new ConfiguracaoInvalidaException(
                $"Variável inválida: {VariavelPorta} deve ser um número entre 1 e 65535");
        }

        return new NpgsqlConnectionStringBuilder
        {
            Host = Ler(VariavelHost),
            Port = porta,
            Database = Ler(VariavelBanco),
            Username = Ler(VariavelUsuario),
            Password = Ler(VariavelSenha),
        }.ConnectionString;
    }
}
