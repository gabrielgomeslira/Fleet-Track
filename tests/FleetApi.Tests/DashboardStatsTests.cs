using System.Net;
using System.Text.Json;
using FleetApi.Data;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

public sealed class DashboardStatsTests(DbFixture banco) : TesteComBanco(banco)
{
    [Fact]
    public async Task Stats_com_banco_vazio_responde_200_com_zeros()
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync("/api/dashboard/stats");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        Assert.Equal(0, json.RootElement.GetProperty("totalVehicles").GetInt32());
        Assert.Equal(0, json.RootElement.GetProperty("deliveriesPerDay").GetArrayLength());
    }

    [Fact]
    public async Task Stats_com_dados_de_demonstracao_conta_veiculos_entregas_e_entregas_por_dia()
    {
        await using (var db = DbFixture.CriarContexto())
        {
            await SeedDemonstracao.ExecutarAsync(db);
        }
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync("/api/dashboard/stats");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        var raiz = json.RootElement;
        Assert.Equal(10, raiz.GetProperty("totalVehicles").GetInt32());
        Assert.Equal(6, raiz.GetProperty("enRoute").GetInt32());
        Assert.Equal(30, raiz.GetProperty("totalDeliveries").GetInt32());
        // So conta o que foi entregue nos ultimos 14 dias: a entrega de Montes Claros (entregue ha
        // exatamente 14 dias no seed) fica de fora do grafico.
        Assert.Equal(raiz.GetProperty("delivered").GetInt32() - 1,
            raiz.GetProperty("deliveriesPerDay").EnumerateArray().Sum(d => d.GetProperty("count").GetInt32()));
    }
}
