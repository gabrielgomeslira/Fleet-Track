using System.Net;
using System.Text.Json;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

public sealed class SmokeTests(DbFixture banco) : TesteComBanco(banco)
{
    [Fact]
    public async Task Listar_veiculos_com_banco_vazio_responde_200_e_lista_vazia()
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync("/api/vehicles");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, json.RootElement.ValueKind);
        Assert.Equal(0, json.RootElement.GetArrayLength());
    }
}
