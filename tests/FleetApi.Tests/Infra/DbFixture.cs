using FleetApi.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace FleetApi.Tests.Infra;

/// <summary>
/// Recria o schema do zero com as migracoes do EF (MigrateAsync, sem seed) no Postgres de teste
/// e limpa as tabelas entre os testes.
/// </summary>
public sealed class DbFixture : IAsyncLifetime
{
    private static readonly string[] Tabelas = ["telemetry_records", "deliveries", "vehicles"];
    private const string HistoricoMigracoes = "\"__EFMigrationsHistory\"";

    public ApiFactory Factory { get; } = new();

    public async Task InitializeAsync()
    {
        GarantirBancoDeTeste(ApiFactory.ConexaoDeTeste);

        await using var conexao = new NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();

        await Executar(conexao, $"DROP TABLE IF EXISTS {string.Join(", ", Tabelas)}, {HistoricoMigracoes} CASCADE");

        await using var db = CriarContexto();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await Factory.DisposeAsync();

    /// <summary>Contexto direto no banco de teste, sem passar pela API (nem pelo seed da subida).</summary>
    public static AppDbContext CriarContexto() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ApiFactory.ConexaoDeTeste).Options);

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
