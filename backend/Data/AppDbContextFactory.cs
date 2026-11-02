using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FleetApi.Data;

/// <summary>
/// Usada só pelas ferramentas do EF (<c>dotnet ef migrations add/script</c>). Evita subir o
/// <c>Program</c> inteiro, que migraria e semearia o banco. Gerar migração não conecta: a string
/// abaixo só escolhe o provedor. Para <c>dotnet ef database update</c>, defina
/// ConnectionStrings__Default.
/// </summary>
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    private const string ConexaoPlaceholder = "Host=localhost;Database=fleet_design;Username=postgres";

    public AppDbContext CreateDbContext(string[] args)
    {
        var conexao = Environment.GetEnvironmentVariable("ConnectionStrings__Default") is { Length: > 0 } valor
            ? valor
            : ConexaoPlaceholder;

        var opcoes = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(conexao).Options;
        return new AppDbContext(opcoes);
    }
}
