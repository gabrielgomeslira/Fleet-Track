using System.Net;
using System.Text.Json;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

/// <summary>T-06 / R6, R7 e R8: leitura de entregas e veiculos (filtro, ordem, projecao, limite, 404).</summary>
public sealed class LeituraTests(DbFixture banco) : TesteComBanco(banco)
{
    // ---- R6: GET /api/deliveries ----

    [Fact]
    public async Task Entregas_filtradas_por_status_devolvem_so_aquele_status()
    {
        var v = Dados.Veiculo("AAA1A11");
        var entregue = Dados.Entrega(v, "entregue", entregueEm: DateTime.UtcNow);
        await Dados.GravarAsync(v, entregue, Dados.Entrega(v, "pendente"), Dados.Entrega(v, "cancelado"));

        var lista = await Ler("/api/deliveries?status=entregue");

        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal(entregue.Id, lista[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Filtro_valido_sem_nenhuma_entrega_naquele_status_devolve_lista_vazia_e_200()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v, Dados.Entrega(v, "pendente"));

        var lista = await Ler("/api/deliveries?status=cancelado");

        Assert.Equal(0, lista.GetArrayLength());
    }

    [Fact]
    public async Task Filtro_de_status_vazio_equivale_a_sem_filtro()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v, Dados.Entrega(v, "pendente"), Dados.Entrega(v, "entregue"));

        var lista = await Ler("/api/deliveries?status=");

        Assert.Equal(2, lista.GetArrayLength());
    }

    [Fact]
    public async Task Entregas_saem_da_mais_recente_para_a_mais_antiga_por_data_de_criacao()
    {
        var v = Dados.Veiculo("AAA1A11");
        var agora = DateTime.UtcNow;
        var velha = Dados.Entrega(v, criadaEm: agora.AddDays(-3));
        var nova = Dados.Entrega(v, criadaEm: agora.AddMinutes(-1));
        var meio = Dados.Entrega(v, criadaEm: agora.AddDays(-1));
        await Dados.GravarAsync(v, velha, nova, meio); // ordem de insercao embaralhada de proposito

        var lista = await Ler("/api/deliveries");

        Assert.Equal([nova.Id, meio.Id, velha.Id], Ids(lista));
    }

    [Fact]
    public async Task Entrega_na_lista_traz_a_placa_do_veiculo_e_so_os_campos_do_contrato()
    {
        var v = Dados.Veiculo("PLC1A23");
        var e = Dados.Entrega(v, "entregue", entregueEm: DateTime.UtcNow);
        await Dados.GravarAsync(v, e);

        var lista = await Ler("/api/deliveries");

        var item = lista[0];
        Assert.Equal("PLC1A23", item.GetProperty("vehiclePlate").GetString());
        Assert.Equal(v.Id, item.GetProperty("vehicleId").GetGuid());
        Assert.Equal("Origem", item.GetProperty("origin").GetString());
        Assert.Equal("Destino", item.GetProperty("destination").GetString());
        // routePath fica fora do contrato ate a T-104 (ADR-0016); vehicle aninhado nao vaza.
        Assert.Equal(
            ["createdAt", "deliveredAt", "destination", "id", "origin", "status", "vehicleId", "vehiclePlate"],
            Nomes(item));
    }

    [Fact]
    public async Task Entrega_pendente_sai_com_deliveredAt_nulo()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v, Dados.Entrega(v, "pendente"));

        var lista = await Ler("/api/deliveries");

        Assert.Equal(JsonValueKind.Null, lista[0].GetProperty("deliveredAt").ValueKind);
    }

    // ---- R7: GET /api/deliveries/{id} e /api/vehicles/{id} ----

    [Fact]
    public async Task Detalhe_da_entrega_traz_placa_e_so_os_campos_do_contrato()
    {
        var v = Dados.Veiculo("DET1A11");
        var e = Dados.Entrega(v, "em_transito");
        await Dados.GravarAsync(v, e);

        var item = await Ler($"/api/deliveries/{e.Id}");

        Assert.Equal(e.Id, item.GetProperty("id").GetGuid());
        Assert.Equal("DET1A11", item.GetProperty("vehiclePlate").GetString());
        Assert.Equal("em_transito", item.GetProperty("status").GetString());
        Assert.Equal(
            ["createdAt", "deliveredAt", "destination", "id", "origin", "status", "vehicleId", "vehiclePlate"],
            Nomes(item));
    }

    [Theory]
    [InlineData("/api/vehicles/nao-e-guid")]
    [InlineData("/api/deliveries/nao-e-guid")]
    [InlineData("/api/vehicles/123")]
    [InlineData("/api/deliveries/123")]
    public async Task Id_que_nao_e_guid_responde_404_pela_rota(string rota)
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync(rota);

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
    }

    [Fact]
    public async Task Detalhe_do_veiculo_traz_so_as_5_ultimas_entregas_da_mais_recente_para_a_mais_antiga()
    {
        var v = Dados.Veiculo("AAA1A11");
        var outro = Dados.Veiculo("BBB2B22");
        var agora = DateTime.UtcNow;
        var entregas = Enumerable.Range(1, 7).Select(i => Dados.Entrega(v, criadaEm: agora.AddDays(-i))).ToList();
        var deOutro = Dados.Entrega(outro, criadaEm: agora); // a mais recente de todas, mas de outro veiculo
        await Dados.GravarAsync(new object[] { v, outro, deOutro }.Concat(entregas.AsEnumerable().Reverse()).ToArray());

        var item = await Ler($"/api/vehicles/{v.Id}");

        var vindas = item.GetProperty("deliveries");
        Assert.Equal(entregas.Take(5).Select(e => e.Id), Ids(vindas)); // dias -1..-5; as de -6 e -7 ficam de fora
        Assert.DoesNotContain(deOutro.Id, Ids(vindas));
    }

    [Fact]
    public async Task Detalhe_do_veiculo_sem_entregas_traz_lista_vazia()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v);

        var item = await Ler($"/api/vehicles/{v.Id}");

        Assert.Equal(0, item.GetProperty("deliveries").GetArrayLength());
    }

    [Fact]
    public async Task Detalhe_do_veiculo_expoe_todos_os_campos_com_posicao_e_leituras_nulas_como_null()
    {
        var v = Dados.Veiculo("NUL1A11"); // sem posicao, velocidade nem combustivel (ADR-0017)
        await Dados.GravarAsync(v);

        var item = await Ler($"/api/vehicles/{v.Id}");

        Assert.Equal(
            ["deliveries", "driverName", "fuelLevel", "id", "latitude", "longitude", "model", "plate", "speed",
                "status", "updatedAt"],
            Nomes(item));
        foreach (var campo in new[] { "latitude", "longitude", "speed", "fuelLevel" })
            Assert.Equal(JsonValueKind.Null, item.GetProperty(campo).ValueKind);
    }

    [Fact]
    public async Task Entrega_do_detalhe_do_veiculo_expoe_so_os_campos_do_contrato()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v, Dados.Entrega(v));

        var item = await Ler($"/api/vehicles/{v.Id}");

        Assert.Equal(
            ["createdAt", "deliveredAt", "destination", "id", "origin", "status"],
            Nomes(item.GetProperty("deliveries")[0]));
    }

    // ---- R8: GET /api/vehicles ----

    [Fact]
    public async Task Veiculos_saem_ordenados_por_placa()
    {
        var c = Dados.Veiculo("CCC3C33");
        var a = Dados.Veiculo("AAA1A11");
        var b = Dados.Veiculo("BBB2B22");
        await Dados.GravarAsync(c, a, b);

        var lista = await Ler("/api/vehicles");

        Assert.Equal([a.Id, b.Id, c.Id], Ids(lista));
    }

    [Fact]
    public async Task Veiculo_com_posicao_completa_sai_com_os_valores_gravados()
    {
        var v = Dados.Veiculo("POS1A11", "em_rota", 72.5);
        v.Latitude = -19.9;
        v.Longitude = -43.9;
        v.FuelLevel = 55;
        v.LastSignalAt = DateTime.UtcNow;
        await Dados.GravarAsync(v);

        var lista = await Ler("/api/vehicles");

        var item = lista[0];
        Assert.Equal(-19.9, item.GetProperty("latitude").GetDouble());
        Assert.Equal(-43.9, item.GetProperty("longitude").GetDouble());
        Assert.Equal(72.5, item.GetProperty("speed").GetDouble());
        Assert.Equal(55, item.GetProperty("fuelLevel").GetInt32());
        Assert.Equal(
            ["driverName", "fuelLevel", "id", "latitude", "longitude", "model", "plate", "speed", "status", "updatedAt"],
            Nomes(item));
    }

    [Fact]
    public async Task Sem_veiculos_a_lista_e_vazia_e_200()
    {
        var lista = await Ler("/api/vehicles");

        Assert.Equal(JsonValueKind.Array, lista.ValueKind);
        Assert.Equal(0, lista.GetArrayLength());
    }

    private async Task<JsonElement> Ler(string rota)
    {
        using var cliente = Banco.Factory.CreateClient();
        var resposta = await cliente.GetAsync(rota);
        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        return JsonDocument.Parse(await resposta.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static Guid[] Ids(JsonElement lista) =>
        lista.EnumerateArray().Select(e => e.GetProperty("id").GetGuid()).ToArray();

    private static string[] Nomes(JsonElement objeto) =>
        objeto.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
}
