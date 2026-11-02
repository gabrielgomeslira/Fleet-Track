using System.Diagnostics;
using FleetApi.Infra;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace FleetApi.Tests;

public sealed class RetencaoTests
{
    private static IConfiguration Config(string? valor) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(valor is null ? [] : [new KeyValuePair<string, string?>(Retencao.Variavel, valor)])
            .Build();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Sem_a_variavel_o_padrao_e_de_24_horas(string? valor)
    {
        var retencao = Retencao.Resolver(Config(valor));

        Assert.Equal(TimeSpan.FromHours(24), retencao.Prazo);
        Assert.False(retencao.AbaixoDoPiso);
    }

    [Theory]
    [InlineData("48", 48)]
    [InlineData("2", 2)]
    [InlineData(" 6 ", 6)]
    [InlineData("0.5", 0.5)]
    [InlineData("1.5", 1.5)]
    [InlineData("87600", 87600)]
    public void Valor_valido_e_respeitado(string valor, double horas)
    {
        Assert.Equal(TimeSpan.FromHours(horas), Retencao.Resolver(Config(valor)).Prazo);
    }

    [Theory]
    [InlineData("1", true)]
    [InlineData("1.99", true)]
    [InlineData("0.5", true)]
    [InlineData("2", false)]
    [InlineData("24", false)]
    public void Abaixo_de_2_horas_e_aceito_e_marcado_para_o_aviso(string valor, bool abaixo)
    {
        Assert.Equal(abaixo, Retencao.Resolver(Config(valor)).AbaixoDoPiso);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("-0.5")]
    [InlineData("1,5")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("-Infinity")]
    [InlineData("1e400")]
    [InlineData("87601")]
    [InlineData("24h")]
    public void Valor_invalido_ou_menor_ou_igual_a_zero_falha_sem_ecoar_o_valor(string valor)
    {
        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => Retencao.Resolver(Config(valor)));

        Assert.Contains(Retencao.Variavel, erro.Message);
        // Valores curtos ("0", "-1") coincidem com números da própria mensagem; o eco é conferido nos longos.
        if (valor.Length > 4)
        {
            Assert.DoesNotContain(valor, erro.Message);
        }
    }

    [Fact]
    public void Mensagem_nao_ecoa_o_que_foi_digitado()
    {
        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => Retencao.Resolver(Config("senha-digitada-por-engano")));

        Assert.DoesNotContain("senha-digitada-por-engano", erro.Message);
    }

    [Fact]
    public async Task Subida_com_retencao_invalida_encerra_com_codigo_diferente_de_zero_e_sem_ecoar_o_valor()
    {
        const string sentinela = "sentinela-invalida";
        var dll = Path.Combine(AppContext.BaseDirectory, "FleetApi.dll");
        var inicio = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        inicio.ArgumentList.Add(dll);
        inicio.Environment["ConnectionStrings__Default"] = "Host=host-sentinela;Database=fleet_test;Username=u";
        inicio.Environment[Retencao.Variavel] = sentinela;
        inicio.Environment["ASPNETCORE_URLS"] = "http://127.0.0.1:0";

        using var processo = Process.Start(inicio)!;
        var saida = processo.StandardOutput.ReadToEndAsync();
        var erro = processo.StandardError.ReadToEndAsync();
        using var limite = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        try
        {
            await processo.WaitForExitAsync(limite.Token);
        }
        catch (OperationCanceledException)
        {
            processo.Kill(entireProcessTree: true);
            throw new Xunit.Sdk.XunitException("A API não encerrou: deveria falhar cedo com a retenção inválida.");
        }

        var texto = await saida + await erro;
        Assert.NotEqual(0, processo.ExitCode);
        Assert.Contains(Retencao.Variavel, texto);
        Assert.DoesNotContain(sentinela, texto);
        Assert.DoesNotContain("host-sentinela", texto);
    }
}
