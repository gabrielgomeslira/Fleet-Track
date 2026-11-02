using System.Text.Json;
using FleetApi.Data;
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
    public async Task Subida_da_api_com_banco_vazio_semeia_quando_o_seed_esta_ligado()
    {
        using var fabrica = Banco.Factory.WithWebHostBuilder(b => b.UseSetting("Seed:Demonstracao", "true"));
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/api/vehicles");

        resposta.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync());
        Assert.Equal(10, json.RootElement.GetArrayLength());
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("true", true)]
    [InlineData("false", false)]
    [InlineData("FALSE", false)]
    [InlineData("lixo", true)]
    public void Seed_vem_ligado_por_padrao_e_so_desliga_com_false(string? valor, bool esperado)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(valor is null
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?> { [SeedDemonstracao.ChaveConfiguracao] = valor })
            .Build();

        Assert.Equal(esperado, SeedDemonstracao.Habilitado(config));
    }
}
