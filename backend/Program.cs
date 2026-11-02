using FleetApi.Data;
using FleetApi.Infra;
using FleetApi.Jobs;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddProblemDetails();

// Retry só de falha transitória de conexão na subida (banco ainda iniciando).
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseNpgsql(
        ConexaoBanco.Resolver(sp.GetRequiredService<IConfiguration>()),
        npgsql => npgsql.EnableRetryOnFailure(maxRetryCount: 3)));

// Simulação da frota e seed: só no modo demo (FLEET_DEMO_MODE=true; padrão false). Fora dele o job
// nem é registrado, então nenhuma posição é alterada, e nada é semeado (ADR-0007).
builder.Services.AddSingleton(TimeProvider.System);
if (SimulacaoJob.Habilitado(builder.Configuration))
{
    builder.Services.AddHostedService<SimulacaoJob>();
}

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Falha cedo: sem a configuração do banco a API nem começa a escutar.
try
{
    ConexaoBanco.Resolver(app.Configuration);
}
catch (ConfiguracaoInvalidaException erro)
{
    Console.Error.WriteLine(erro.Message);
    return 1;
}

// "dotnet FleetApi.dll migrate" aplica as migrações e sai, para quem prefere migrar no deploy (ADR-0002).
var somenteMigrar = args.Contains("migrate", StringComparer.OrdinalIgnoreCase);

// Migra na subida. MigrateAsync fica fora de transação própria: o lock do EF 9+ depende disso.
try
{
    using var escopo = app.Services.CreateScope();
    var db = escopo.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    if (!somenteMigrar && SeedDemonstracao.Habilitado(app.Configuration))
    {
        await SeedDemonstracao.ExecutarAsync(db);
    }
}
catch (Exception erro)
{
    // Banco inalcançável ou migração quebrada: não faz sentido servir a API.
    app.Logger.LogCritical(erro, "Falha ao preparar o banco de dados; a API nao vai subir.");
    return 1;
}

if (somenteMigrar)
{
    app.Logger.LogInformation("Migracoes aplicadas.");
    return 0;
}

app.UseCors();
app.MapControllers();
app.Run();
return 0;

public partial class Program { }
