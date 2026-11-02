using System.Net;
using System.Text.Json;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

/// <summary>H-03 / SEC-05: id inexistente responde 404; filtro invalido responde 400, nunca 500.</summary>
public sealed class Regressao404e400Tests(DbFixture banco) : TesteComBanco(banco)
{
    private static readonly string[] StatusAceitos = ["pendente", "em_transito", "entregue", "cancelado"];

    [Theory]
    [InlineData("/api/vehicles/")]
    [InlineData("/api/deliveries/")]
    [InlineData("/api/telemetry/")]
    public async Task Id_inexistente_responde_404_com_mensagem_legivel(string rota)
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync(rota + Guid.NewGuid());

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        using var json = await LerJson(resposta);
        Assert.Equal(404, json.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(json.RootElement.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task Telemetria_de_veiculo_existente_sem_registros_responde_200_e_lista_vazia()
    {
        var veiculo = await InserirVeiculo();
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/telemetry/{veiculo}");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        using var json = await LerJson(resposta);
        Assert.Equal(0, json.RootElement.GetArrayLength());
    }

    [Theory]
    [InlineData("pendente")]
    [InlineData("em_transito")]
    [InlineData("entregue")]
    [InlineData("cancelado")]
    public async Task Filtro_de_status_valido_responde_200(string status)
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/deliveries?status={status}");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
    }

    [Fact]
    public async Task Sem_filtro_de_status_lista_todas_as_entregas()
    {
        var veiculo = await InserirVeiculo();
        await InserirEntrega(veiculo, "pendente");
        await InserirEntrega(veiculo, "entregue");
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync("/api/deliveries");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        using var json = await LerJson(resposta);
        Assert.Equal(2, json.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Filtro_de_status_fora_da_lista_responde_400_indicando_o_filtro_e_os_valores_aceitos()
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync("/api/deliveries?status=atrasado");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        using var json = await LerJson(resposta);
        Assert.Equal(400, json.RootElement.GetProperty("status").GetInt32());
        var mensagens = json.RootElement.GetProperty("errors").GetProperty("status")
            .EnumerateArray().Select(m => m.GetString()).ToList();
        Assert.NotEmpty(mensagens);
        foreach (var aceito in StatusAceitos)
        {
            Assert.Contains(mensagens, m => m!.Contains(aceito));
        }
    }

    [Theory]
    [InlineData("Entregue")] // caixa diferente
    [InlineData("entregue%20")] // espaco no fim
    [InlineData("em-transito")]
    [InlineData("em_tr%C3%A2nsito")] // acento
    [InlineData("%F0%9F%9A%9A")] // emoji
    [InlineData("%25")] // %
    [InlineData("%27")] // '
    [InlineData("%27%20OR%201%3D1%20--")] // injecao de SQL
    [InlineData("%00")] // nulo
    public async Task Filtro_de_status_malicioso_ou_malformado_responde_400_e_nunca_500(string status)
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/deliveries?status={status}");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        using var json = await LerJson(resposta);
        Assert.True(json.RootElement.GetProperty("errors").TryGetProperty("status", out _));
    }

    [Fact]
    public async Task Filtro_de_status_com_string_de_10_KB_responde_400_e_nunca_500()
    {
        using var cliente = Banco.Factory.CreateClient();

        var resposta = await cliente.GetAsync($"/api/deliveries?status={new string('a', 10 * 1024)}");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Resposta_400_nao_repete_o_valor_enviado_pelo_cliente()
    {
        using var cliente = Banco.Factory.CreateClient();
        var valor = new string('a', 10 * 1024);

        var resposta = await cliente.GetAsync($"/api/deliveries?status={valor}");

        var corpo = await resposta.Content.ReadAsStringAsync();
        Assert.DoesNotContain(valor, corpo);
    }

    private static async Task<JsonDocument> LerJson(HttpResponseMessage resposta) =>
        JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());

    private async Task<Guid> InserirVeiculo()
    {
        var id = Guid.NewGuid();
        await Executar(
            "INSERT INTO vehicles (id, plate, model, driver_name) VALUES (@id, 'ABC1D23', 'Modelo', 'Motorista')",
            ("id", id));
        return id;
    }

    private async Task InserirEntrega(Guid veiculo, string status) =>
        await Executar(
            "INSERT INTO deliveries (id, vehicle_id, origin, destination, status) " +
            "VALUES (@id, @veiculo, 'A', 'B', @status)",
            ("id", Guid.NewGuid()), ("veiculo", veiculo), ("status", status));

    private static async Task Executar(string sql, params (string Nome, object Valor)[] parametros)
    {
        await using var conexao = new Npgsql.NpgsqlConnection(ApiFactory.ConexaoDeTeste);
        await conexao.OpenAsync();
        await using var comando = new Npgsql.NpgsqlCommand(sql, conexao);
        foreach (var (nome, valor) in parametros) comando.Parameters.AddWithValue(nome, valor);
        await comando.ExecuteNonQueryAsync();
    }
}
