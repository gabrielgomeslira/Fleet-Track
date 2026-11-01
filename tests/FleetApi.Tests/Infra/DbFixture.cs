using Npgsql;
using Xunit;

namespace FleetApi.Tests.Infra;

/// <summary>
/// Prepara o schema de db/init.sql (sem os INSERT) no Postgres de teste e limpa as tabelas
/// entre os testes. Ate a T-13 nao ha migracoes.
/// </summary>
public sealed class DbFixture : IAsyncLifetime
{
    private static readonly string[] Tabelas = ["telemetry_records", "deliveries", "vehicles"];

    public ApiFactory Factory { get; } = new();

    public async Task InitializeAsync()
    {
        GarantirBancoDeTeste(ApiFactory.ConexaoDeTeste);

        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();

        await Executar(conexao, $"DROP TABLE IF EXISTS {string.Join(", ", Tabelas)} CASCADE");
        foreach (var comando in LerSchemaSemInserts())
        {
            await Executar(conexao, comando);
        }
    }

    public async Task DisposeAsync() => await Factory.DisposeAsync();

    public async Task LimparAsync()
    {
        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await Executar(conexao, $"TRUNCATE TABLE {string.Join(", ", Tabelas)} CASCADE");
    }

    /// <summary>Recusa rodar contra um banco que nao seja de teste: a fixture apaga dados.</summary>
    private static void GarantirBancoDeTeste(string conexao)
    {
        var banco = new NpgsqlConnectionStringBuilder(conexao).Database ?? string.Empty;
        if (!banco.EndsWith("_test", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Os testes apagam dados e so rodam em um banco cujo nome termina em '_test'. " +
                "Ajuste a variavel ConnectionStrings__Default.");
        }
    }

    private static IEnumerable<string> LerSchemaSemInserts()
    {
        var caminho = Path.Combine(AppContext.BaseDirectory, "db", "init.sql");
        var sql = File.ReadAllText(caminho);

        return sql.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(c => c.Length > 0 && !c.StartsWith("INSERT", StringComparison.OrdinalIgnoreCase));
    }

    private static async Task Executar(NpgsqlConnection conexao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync();
    }
}

[CollectionDefinition(Nome)]
public sealed class BancoCollection : ICollectionFixture<DbFixture>
{
    public const string Nome = "Banco";
}

/// <summary>Base dos testes que usam o banco: limpa as tabelas antes de cada teste.</summary>
[Collection(BancoCollection.Nome)]
public abstract class TesteComBanco(DbFixture banco) : IAsyncLifetime
{
    protected DbFixture Banco { get; } = banco;

    public Task InitializeAsync() => Banco.LimparAsync();

    public Task DisposeAsync() => Task.CompletedTask;
}
