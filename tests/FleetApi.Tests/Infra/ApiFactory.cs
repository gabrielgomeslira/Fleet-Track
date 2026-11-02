using FleetApi.Jobs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetApi.Tests.Infra;

/// <summary>
/// Sobe a API em memoria contra o Postgres real indicado em ConnectionStrings__Default.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Chave so dos testes: com "true", o <see cref="ExpurgoJob"/> continua registrado.</summary>
    public const string MantemExpurgo = "TESTE_MANTER_EXPURGO";

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

        // O expurgo roda na subida e apagaria a telemetria que os testes datam de proposito no passado.
        // Fica de fora, salvo no teste que pede (MantemExpurgo) para provar a ligacao na subida.
        builder.ConfigureServices((contexto, servicos) =>
        {
            if (contexto.Configuration[MantemExpurgo] == "true")
            {
                return;
            }

            foreach (var servico in servicos
                         .Where(d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(ExpurgoJob))
                         .ToList())
            {
                servicos.Remove(servico);
            }
        });
    }
}
