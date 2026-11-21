using System.Net;
using System.Text.Json;
using FleetApi.Controllers;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

/// <summary>GET /api/telemetry/{id}/route: trajeto por período para o gestor rever o caminho feito.</summary>
public sealed class TrajetoTests(DbFixture banco) : TesteComBanco(banco)
{
    private static readonly DateTime Base = new(2026, 11, 20, 12, 0, 0, DateTimeKind.Utc);

    private static TelemetryRecord Ponto(Vehicle v, DateTime instante, double lat = -23.5, double lon = -46.6) => new()
    {
        Id = Guid.NewGuid(),
        VehicleId = v.Id,
        Latitude = lat,
        Longitude = lon,
        Speed = 50,
        FuelLevel = 80,
        RecordedAt = instante,
    };

    private static string Iso(DateTime instante) => Uri.EscapeDataString(instante.ToString("O"));

    [Fact]
    public async Task Devolve_so_os_pontos_do_periodo_do_mais_antigo_ao_mais_novo()
    {
        var v = Dados.Veiculo("TRJ1A11");
        var outro = Dados.Veiculo("TRJ1A12");
        await Dados.GravarAsync(v, outro,
            Ponto(v, Base.AddMinutes(30), lat: -23.3),
            Ponto(v, Base, lat: -23.1),               // no limite inicial: entra
            Ponto(v, Base.AddMinutes(10), lat: -23.2),
            Ponto(v, Base.AddHours(1)),               // no limite final: fica fora
            Ponto(v, Base.AddMinutes(-1)),            // antes do período
            Ponto(outro, Base.AddMinutes(5)));        // outro veículo

        var resposta = await Ler($"/api/telemetry/{v.Id}/route?from={Iso(Base)}&to={Iso(Base.AddHours(1))}");

        var pontos = resposta.GetProperty("points");
        Assert.Equal([-23.1, -23.2, -23.3], pontos.EnumerateArray().Select(p => p.GetProperty("latitude").GetDouble()));
        Assert.False(resposta.GetProperty("truncated").GetBoolean());
        Assert.Equal(
            ["fuelLevel", "latitude", "longitude", "recordedAt", "speed"],
            pontos[0].EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Sem_periodo_usa_as_ultimas_24_horas()
    {
        var v = Dados.Veiculo("TRJ1A11");
        var agora = DateTime.UtcNow;
        await Dados.GravarAsync(v, Ponto(v, agora.AddHours(-1)), Ponto(v, agora.AddHours(-30)));

        var resposta = await Ler($"/api/telemetry/{v.Id}/route");

        Assert.Equal(1, resposta.GetProperty("points").GetArrayLength());
    }

    [Fact]
    public async Task Ponto_de_semanas_atras_continua_disponivel_para_analise()
    {
        var v = Dados.Veiculo("TRJ1A11");
        var dia = DateTime.UtcNow.Date.AddDays(-30);
        await Dados.GravarAsync(v, Ponto(v, dia.AddHours(9)), Ponto(v, dia.AddHours(10)));

        var resposta = await Ler($"/api/telemetry/{v.Id}/route?from={Iso(dia)}&to={Iso(dia.AddDays(1))}");

        Assert.Equal(2, resposta.GetProperty("points").GetArrayLength());
    }

    [Fact]
    public async Task Acima_do_teto_corta_e_avisa()
    {
        var v = Dados.Veiculo("TRJ1A11");
        var pontos = Enumerable.Range(0, TelemetryController.TetoDePontos + 3)
            .Select(i => (object)Ponto(v, Base.AddSeconds(i)));
        await Dados.GravarAsync([v, .. pontos]);

        var resposta = await Ler($"/api/telemetry/{v.Id}/route?from={Iso(Base)}&to={Iso(Base.AddDays(1))}");

        Assert.Equal(TelemetryController.TetoDePontos, resposta.GetProperty("points").GetArrayLength());
        Assert.True(resposta.GetProperty("truncated").GetBoolean());
    }

    [Theory]
    [InlineData(0, 0)]    // to igual a from
    [InlineData(2, 1)]    // to antes de from
    [InlineData(0, 192)]  // 8 dias: acima da janela máxima
    public async Task Periodo_invalido_responde_400(int horasFrom, int horasTo)
    {
        var v = Dados.Veiculo("TRJ1A11");
        await Dados.GravarAsync(v);
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync(
            $"/api/telemetry/{v.Id}/route?from={Iso(Base.AddHours(horasFrom))}&to={Iso(Base.AddHours(horasTo))}");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Data_mal_formada_responde_400()
    {
        var v = Dados.Veiculo("TRJ1A11");
        await Dados.GravarAsync(v);
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/telemetry/{v.Id}/route?from=ontem");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Veiculo_inexistente_responde_404()
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/telemetry/{Guid.NewGuid()}/route");

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
    }

    private async Task<JsonElement> Ler(string rota)
    {
        using var cliente = Banco.Factory.CreateClient();
        var resposta = await cliente.GetAsync(rota);
        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        return JsonDocument.Parse(await resposta.Content.ReadAsStringAsync()).RootElement.Clone();
    }
}
