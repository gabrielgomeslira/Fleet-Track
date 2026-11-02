using FleetApi.Data;
using FleetApi.Infra;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddProblemDetails();

builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseNpgsql(ConexaoBanco.Resolver(sp.GetRequiredService<IConfiguration>())));

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

app.UseCors();
app.MapControllers();
app.Run();
return 0;

public partial class Program { }
