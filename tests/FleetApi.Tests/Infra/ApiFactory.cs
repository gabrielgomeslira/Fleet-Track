using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FleetApi.Tests.Infra;

/// <summary>
/// Sobe a API em memoria contra o Postgres real indicado em ConnectionStrings__Default.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string PadraoConexao = "Host=localhost;Port=5432;Database=fleet_test;Username=postgres";

    public static string ConexaoDeTeste =>
        Environment.GetEnvironmentVariable("ConnectionStrings__Default") is { Length: > 0 } valor
            ? valor
            : PadraoConexao;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", ConexaoDeTeste);
        // Os testes criam os proprios dados; o seed e o job da subida so entram nos testes que ligam o
        // modo demo. Fixar "false" evita que um FLEET_DEMO_MODE do ambiente de quem roda interfira.
        builder.UseSetting("FLEET_DEMO_MODE", "false");
    }
}
