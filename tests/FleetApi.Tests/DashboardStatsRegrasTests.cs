using System.Globalization;
using System.Net;
using System.Text.Json;
using FleetApi.Tests.Infra;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// T-06 / R1: regras de GET /api/dashboard/stats. Complementa DashboardStatsTests (banco vazio e seed).
/// </summary>
public sealed class DashboardStatsRegrasTests(DbFixture banco) : TesteComBanco(banco)
{
    [Fact]
    public async Task Somente_entregas_canceladas_zera_taxa_e_velocidade_e_conta_so_cancelado()
    {
        var v = Dados.Veiculo("AAA1A11", "parado");
        await Dados.GravarAsync(v, Dados.Entrega(v, "cancelado"), Dados.Entrega(v, "cancelado"));

        var s = await LerStats();

        Assert.Equal(2, s.GetProperty("totalDeliveries").GetInt32());
        Assert.Equal(2, s.GetProperty("cancelled").GetInt32());
        Assert.Equal(0, s.GetProperty("delivered").GetInt32());
        Assert.Equal(0, s.GetProperty("deliveryRate").GetDouble());
        Assert.Equal(0, s.GetProperty("avgSpeed").GetDouble());
        Assert.Equal(0, s.GetProperty("deliveriesPerDay").GetArrayLength());
    }

    [Fact]
    public async Task Mix_de_status_conta_cada_veiculo_e_cada_entrega_na_sua_faixa()
    {
        var emRota = Dados.Veiculo("AAA1A11", "em_rota", 50);
        var parado = Dados.Veiculo("BBB2B22", "parado");
        var manutencao = Dados.Veiculo("CCC3C33", "manutencao");
        await Dados.GravarAsync(emRota, parado, manutencao,
            Dados.Entrega(emRota, "pendente"),
            Dados.Entrega(emRota, "em_transito"), Dados.Entrega(emRota, "em_transito"),
            Dados.Entrega(parado, "entregue", entregueEm: DateTime.UtcNow.AddDays(-1)),
            Dados.Entrega(parado, "entregue", entregueEm: DateTime.UtcNow.AddDays(-2)),
            Dados.Entrega(parado, "entregue", entregueEm: DateTime.UtcNow.AddDays(-3)),
            Dados.Entrega(parado, "cancelado"));

        var s = await LerStats();

        Assert.Equal(3, s.GetProperty("totalVehicles").GetInt32());
        Assert.Equal(1, s.GetProperty("enRoute").GetInt32());
        Assert.Equal(1, s.GetProperty("stopped").GetInt32());
        Assert.Equal(1, s.GetProperty("maintenance").GetInt32());
        Assert.Equal(7, s.GetProperty("totalDeliveries").GetInt32());
        Assert.Equal(1, s.GetProperty("pending").GetInt32());
        Assert.Equal(2, s.GetProperty("inTransit").GetInt32());
        Assert.Equal(3, s.GetProperty("delivered").GetInt32());
        Assert.Equal(1, s.GetProperty("cancelled").GetInt32());
        Assert.Equal(42.9, s.GetProperty("deliveryRate").GetDouble()); // 3/7
    }

    [Theory]
    [InlineData(1, 3, 33.3)]
    [InlineData(2, 3, 66.7)]
    [InlineData(1, 8, 12.5)]
    [InlineData(3, 3, 100)]
    public async Task Taxa_de_entrega_arredonda_em_uma_casa_decimal(int entregues, int total, double esperado)
    {
        var v = Dados.Veiculo("AAA1A11");
        var entregas = Enumerable.Range(0, total)
            .Select(i => (object)Dados.Entrega(v, i < entregues ? "entregue" : "pendente",
                entregueEm: i < entregues ? DateTime.UtcNow.AddDays(-1) : null));
        await Dados.GravarAsync(entregas.Prepend(v).ToArray());

        var s = await LerStats();

        Assert.Equal(esperado, s.GetProperty("deliveryRate").GetDouble());
    }

    [Fact]
    public async Task Velocidade_media_considera_so_veiculos_em_rota_e_arredonda_em_uma_casa()
    {
        await Dados.GravarAsync(
            Dados.Veiculo("AAA1A11", "em_rota", 50),
            Dados.Veiculo("BBB2B22", "em_rota", 61),
            Dados.Veiculo("CCC3C33", "em_rota", 70), // media 60,33... -> 60.3
            Dados.Veiculo("DDD4D44", "parado", 999), // fora da media
            Dados.Veiculo("EEE5E55", "manutencao", 999)); // fora da media

        var s = await LerStats();

        Assert.Equal(60.3, s.GetProperty("avgSpeed").GetDouble());
    }

    [Fact]
    public async Task Velocidade_media_ignora_veiculo_em_rota_sem_leitura_de_velocidade()
    {
        // ADR-0017: speed nula e "sem dado", nao 0 km/h. Nao pode puxar a media para baixo.
        await Dados.GravarAsync(
            Dados.Veiculo("AAA1A11", "em_rota", 80),
            Dados.Veiculo("BBB2B22", "em_rota", null));

        var s = await LerStats();

        Assert.Equal(80, s.GetProperty("avgSpeed").GetDouble());
    }

    [Fact]
    public async Task Velocidade_media_e_zero_quando_nenhum_veiculo_em_rota_tem_velocidade()
    {
        await Dados.GravarAsync(
            Dados.Veiculo("AAA1A11", "em_rota", null),
            Dados.Veiculo("BBB2B22", "parado", 40));

        var s = await LerStats();

        Assert.Equal(0, s.GetProperty("avgSpeed").GetDouble());
    }

    [Fact]
    public async Task Janela_de_14_dias_inclui_13d23h_e_exclui_14d01h()
    {
        var v = Dados.Veiculo("AAA1A11");
        var dentro = DateTime.UtcNow.AddDays(-14).AddHours(1);
        var fora = DateTime.UtcNow.AddDays(-14).AddHours(-1);
        await Dados.GravarAsync(v,
            Dados.Entrega(v, "entregue", entregueEm: dentro),
            Dados.Entrega(v, "entregue", entregueEm: fora));

        var s = await LerStats();

        var dias = Dias(s);
        Assert.Single(dias);
        Assert.Equal(DiaUtc(dentro), dias[0].Dia);
        Assert.Equal(1, dias[0].Total);
        // A janela so afeta o grafico: as duas entregas continuam contadas em "delivered".
        Assert.Equal(2, s.GetProperty("delivered").GetInt32());
    }

    [Fact]
    public async Task Entrega_sem_data_de_entrega_nao_entra_no_grafico()
    {
        var v = Dados.Veiculo("AAA1A11");
        await Dados.GravarAsync(v,
            Dados.Entrega(v, "entregue", entregueEm: null),
            Dados.Entrega(v, "pendente"));

        var s = await LerStats();

        Assert.Equal(0, s.GetProperty("deliveriesPerDay").GetArrayLength());
    }

    [Fact]
    public async Task Entregas_por_dia_agrupa_em_dia_UTC_ordena_crescente_e_sai_como_data_pura()
    {
        // Dois instantes a 1 h um do outro cruzam a meia-noite UTC e caem em dias diferentes.
        var v = Dados.Veiculo("AAA1A11");
        var meiaNoite = DateTime.UtcNow.Date.AddDays(-5);
        var antes = meiaNoite.AddMinutes(-30); // 23:30 do dia -6
        var depois = meiaNoite.AddMinutes(30); // 00:30 do dia -5
        var depois2 = meiaNoite.AddHours(20); // mesmo dia -5
        await Dados.GravarAsync(v,
            Dados.Entrega(v, "entregue", entregueEm: depois2),
            Dados.Entrega(v, "entregue", entregueEm: depois),
            Dados.Entrega(v, "entregue", entregueEm: antes));

        var s = await LerStats();

        var bruto = s.GetProperty("deliveriesPerDay").EnumerateArray().First().GetProperty("date").GetString()!;
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", bruto); // sem hora nem "Z"
        var dias = Dias(s);
        Assert.Equal(2, dias.Count);
        Assert.Equal(DiaUtc(antes), dias[0].Dia);
        Assert.Equal(1, dias[0].Total);
        Assert.Equal(DiaUtc(depois), dias[1].Dia);
        Assert.Equal(2, dias[1].Total);
    }

    [Fact]
    public async Task Contrato_expoe_exatamente_as_12_propriedades_esperadas()
    {
        var s = await LerStats();

        var nomes = s.EnumerateObject().Select(p => p.Name).ToArray();
        string[] esperado =
        [
            "avgSpeed", "cancelled", "delivered", "deliveriesPerDay", "deliveryRate", "enRoute",
            "inTransit", "maintenance", "pending", "stopped", "totalDeliveries", "totalVehicles",
        ];
        Assert.Equal(esperado.Order(StringComparer.Ordinal), nomes.Order(StringComparer.Ordinal));
    }

    private async Task<JsonElement> LerStats()
    {
        using var cliente = Banco.Factory.CreateClient();
        var resposta = await cliente.GetAsync("/api/dashboard/stats");
        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        return JsonDocument.Parse(await resposta.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static string DiaUtc(DateTime instante) =>
        instante.ToUniversalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static List<(string Dia, int Total)> Dias(JsonElement stats) =>
        stats.GetProperty("deliveriesPerDay").EnumerateArray()
            .Select(d => (d.GetProperty("date").GetString()!, d.GetProperty("count").GetInt32()))
            .ToList();
}
