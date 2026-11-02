using System.Text.Json;
using System.Text.RegularExpressions;
using FleetApi.Data;
using FleetApi.Demo;
using FleetApi.Jobs;
using FleetApi.Models;
using FleetApi.Tests.Infra;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace FleetApi.Tests;

public sealed class SeedDemonstracaoTests(DbFixture banco) : TesteComBanco(banco)
{
    [Fact]
    public async Task Banco_vazio_recebe_os_dados_de_demonstracao_do_antigo_init_sql()
    {
        await using var db = DbFixture.CriarContexto();

        var semeou = await SeedDemonstracao.ExecutarAsync(db);

        Assert.True(semeou);
        Assert.Equal(10, await db.Vehicles.CountAsync());
        Assert.Equal(30, await db.Deliveries.CountAsync());
        // 9 veiculos (o que esta em manutencao fica de fora) x 10 pontos.
        Assert.Equal(90, await db.TelemetryRecords.CountAsync());
    }

    [Fact]
    public async Task Veiculos_mantem_ids_e_valores_fixos_do_init_sql()
    {
        await using var db = DbFixture.CriarContexto();
        await SeedDemonstracao.ExecutarAsync(db);

        var primeiro = await db.Vehicles.SingleAsync(v => v.Id == Guid.Parse("a1b2c3d4-0001-4000-8000-000000000001"));
        var ultimo = await db.Vehicles.SingleAsync(v => v.Id == Guid.Parse("a1b2c3d4-0010-4000-8000-000000000010"));

        Assert.Equal(("ABC-1234", "Volvo FH 540", "Carlos Silva", "em_rota"),
            (primeiro.Plate, primeiro.Model, primeiro.DriverName, primeiro.Status));
        Assert.Equal((72.5, 68), (primeiro.Speed, primeiro.FuelLevel));
        Assert.Equal(("BCD-9900", "parado"), (ultimo.Plate, ultimo.Status));
    }

    [Fact]
    public async Task Veiculo_em_manutencao_nao_tem_telemetria_e_o_combustivel_nunca_cai_de_10()
    {
        await using var db = DbFixture.CriarContexto();
        await SeedDemonstracao.ExecutarAsync(db);

        var emManutencao = await db.Vehicles.Where(v => v.Status == "manutencao").Select(v => v.Id).ToListAsync();
        var pontos = await db.TelemetryRecords.ToListAsync();

        Assert.Single(emManutencao);
        Assert.DoesNotContain(pontos, p => emManutencao.Contains(p.VehicleId));
        Assert.All(pontos, p => Assert.True(p.FuelLevel >= 10));
        Assert.All(pontos.Where(p => p.Speed > 0), p => Assert.InRange(p.Speed, 40, 100));
    }

    [Fact]
    public async Task Entrega_em_transito_recebe_o_corredor_e_as_demais_ficam_sem_rota()
    {
        await using var db = DbFixture.CriarContexto();
        await SeedDemonstracao.ExecutarAsync(db);
        db.ChangeTracker.Clear();

        var entregas = await db.Deliveries.ToListAsync();
        var emTransito = entregas.Where(e => e.Status == "em_transito").ToList();

        Assert.NotEmpty(emTransito);
        Assert.All(emTransito, e =>
        {
            var esperado = Corredores.Obter(e.Origin, e.Destination);
            Assert.NotNull(e.RoutePath);
            // O jsonb normaliza espaços e ordem das chaves: compara o conteúdo, não o texto.
            using var gravado = JsonDocument.Parse(e.RoutePath);
            Assert.Equal("LineString", gravado.RootElement.GetProperty("type").GetString());
            Assert.Equal(
                esperado.Pontos,
                gravado.RootElement.GetProperty("coordinates").EnumerateArray()
                    .Select(c => new Ponto(c[0].GetDouble(), c[1].GetDouble())).ToList());
        });
        Assert.All(entregas.Where(e => e.Status != "em_transito"), e => Assert.Null(e.RoutePath));
    }

    [Fact]
    public async Task Trajeto_nao_aparece_no_contrato_atual_da_api()
    {
        await using (var db = DbFixture.CriarContexto())
        {
            await SeedDemonstracao.ExecutarAsync(db);
        }
        using var cliente = Banco.Factory.CreateClient();

        var lista = await cliente.GetStringAsync("/api/deliveries");
        var emTransito = JsonDocument.Parse(lista).RootElement.EnumerateArray()
            .First(e => e.GetProperty("status").GetString() == "em_transito").GetProperty("id").GetGuid();
        var detalhe = await cliente.GetStringAsync($"/api/deliveries/{emTransito}");

        // Expor o trajeto é da T-104; até lá o contrato não muda.
        Assert.DoesNotContain("route", lista, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("route", detalhe, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("LineString", lista + detalhe);
    }

    [Fact]
    public async Task Rodar_de_novo_nao_duplica_nada()
    {
        await using var db = DbFixture.CriarContexto();
        await SeedDemonstracao.ExecutarAsync(db);

        var segunda = await SeedDemonstracao.ExecutarAsync(db);

        Assert.False(segunda);
        Assert.Equal(10, await db.Vehicles.CountAsync());
        Assert.Equal(30, await db.Deliveries.CountAsync());
        Assert.Equal(90, await db.TelemetryRecords.CountAsync());
    }

    [Fact]
    public async Task Tabela_com_veiculo_proprio_nao_recebe_seed()
    {
        await using var db = DbFixture.CriarContexto();
        db.Vehicles.Add(new Vehicle { Plate = "ZZZ-0000", Model = "m", DriverName = "d" });
        await db.SaveChangesAsync();

        var semeou = await SeedDemonstracao.ExecutarAsync(db);

        Assert.False(semeou);
        Assert.Equal(1, await db.Vehicles.CountAsync());
        Assert.Equal(0, await db.Deliveries.CountAsync());
    }

    [Fact]
    public async Task Subida_da_api_no_modo_demo_com_banco_vazio_semeia()
    {
        using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.UseSetting(SeedDemonstracao.ChaveConfiguracao, "true"));
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/api/vehicles");

        resposta.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        Assert.Equal(10, json.RootElement.GetArrayLength());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    [InlineData("1")]
    [InlineData("lixo")]
    public async Task Subida_da_api_fora_do_modo_demo_nao_carrega_o_seed(string? valor)
    {
        using var fabrica = Banco.Factory.WithWebHostBuilder(
            b => b.UseSetting(SeedDemonstracao.ChaveConfiguracao, valor));
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/api/vehicles");

        resposta.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        Assert.Equal(0, json.RootElement.GetArrayLength());
        await using var db = DbFixture.CriarContexto();
        Assert.Equal(0, await db.Deliveries.CountAsync());
        Assert.Equal(0, await db.TelemetryRecords.CountAsync());
    }

    [Fact]
    public async Task Subida_da_api_no_modo_demo_com_dados_proprios_nao_semeia()
    {
        await using (var db = DbFixture.CriarContexto())
        {
            db.Vehicles.Add(new Vehicle { Plate = "ZZZ-0000", Model = "m", DriverName = "d" });
            await db.SaveChangesAsync();
        }
        using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.UseSetting(SeedDemonstracao.ChaveConfiguracao, "true"));
        using var cliente = fabrica.CreateClient();

        (await cliente.GetAsync("/api/vehicles")).EnsureSuccessStatusCode();

        await using var verificacao = DbFixture.CriarContexto();
        Assert.Equal(1, await verificacao.Vehicles.CountAsync());
        Assert.Equal(0, await verificacao.Deliveries.CountAsync());
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("false", false)]
    [InlineData("1", false)]
    [InlineData("lixo", false)]
    [InlineData("true", true)]
    [InlineData("TRUE", true)]
    public void Seed_vem_desligado_por_padrao_e_so_liga_com_true(string? valor, bool esperado)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(valor is null
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?> { [SeedDemonstracao.ChaveConfiguracao] = valor })
            .Build();

        Assert.Equal(esperado, SeedDemonstracao.Habilitado(config));
    }

    [Fact]
    public void Seed_e_job_leem_a_mesma_variavel_FLEET_DEMO_MODE()
    {
        Assert.Equal("FLEET_DEMO_MODE", SeedDemonstracao.ChaveConfiguracao);
        Assert.Equal(SimulacaoJob.ChaveConfiguracao, SeedDemonstracao.ChaveConfiguracao);
    }

    [Fact]
    public async Task Nomes_e_placas_do_seed_sao_ficticios()
    {
        await using var db = DbFixture.CriarContexto();
        await SeedDemonstracao.ExecutarAsync(db);

        var veiculos = await db.Vehicles.AsNoTracking().ToListAsync();

        Assert.Equal(10, veiculos.Count);
        Assert.Equal(veiculos.Count, veiculos.Select(v => v.Plate).Distinct().Count());
        foreach (var v in veiculos)
        {
            // Placa de mentira: três letras consecutivas do alfabeto (ABC, DEF, ..., YZA) e dígitos em
            // sequência (1234, 5678, 9012, ...) ou pares repetidos (1122, 9900). Uma placa real colada
            // aqui por engano não passa neste teste.
            var m = Regex.Match(v.Plate, @"^([A-Z])([A-Z])([A-Z])-(\d{4})$");
            Assert.True(m.Success, $"placa fora do formato fictício: {v.Plate}");
            Assert.True(
                Consecutivas(m.Groups[1].Value[0], m.Groups[2].Value[0]) && Consecutivas(m.Groups[2].Value[0], m.Groups[3].Value[0]),
                $"letras da placa não são consecutivas: {v.Plate}");

            // Motorista: só letras e espaços (nome e sobrenome), sem e-mail, telefone ou documento.
            Assert.Matches(@"^\p{L}+( \p{L}+)+$", v.DriverName);
        }
    }

    private static bool Consecutivas(char a, char b) => b == (a == 'Z' ? 'A' : (char)(a + 1));
}
