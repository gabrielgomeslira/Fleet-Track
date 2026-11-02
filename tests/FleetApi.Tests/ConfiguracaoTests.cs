using System.Diagnostics;
using FleetApi.Infra;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Xunit;

namespace FleetApi.Tests;

public sealed class ConfiguracaoTests
{
    private static IConfiguration Config(params (string Chave, string? Valor)[] itens) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(itens.Select(i => new KeyValuePair<string, string?>(i.Chave, i.Valor)))
            .Build();

    private static (string, string?)[] VariaveisCompletas() =>
    [
        ("POSTGRES_HOST", "db"),
        ("POSTGRES_PORT", "5433"),
        ("POSTGRES_DB", "fleetdb"),
        ("POSTGRES_USER", "admin"),
        ("POSTGRES_PASSWORD", "s3nha;com=chars'especiais"),
    ];

    [Fact]
    public void Monta_a_conexao_a_partir_das_variaveis_POSTGRES()
    {
        var conexao = ConexaoBanco.Resolver(Config(VariaveisCompletas()));

        var b = new NpgsqlConnectionStringBuilder(conexao);
        Assert.Equal("db", b.Host);
        Assert.Equal(5433, b.Port);
        Assert.Equal("fleetdb", b.Database);
        Assert.Equal("admin", b.Username);
        Assert.Equal("s3nha;com=chars'especiais", b.Password);
    }

    [Fact]
    public void Porta_ausente_usa_5432()
    {
        var itens = VariaveisCompletas().Where(i => i.Item1 != "POSTGRES_PORT").ToArray();

        var b = new NpgsqlConnectionStringBuilder(ConexaoBanco.Resolver(Config(itens)));

        Assert.Equal(5432, b.Port);
    }

    [Fact]
    public void ConnectionStrings_Default_tem_precedencia_sobre_POSTGRES()
    {
        var itens = VariaveisCompletas().Append(("ConnectionStrings:Default", "Host=teste;Database=fleet_test")).ToArray();

        var conexao = ConexaoBanco.Resolver(Config(itens));

        Assert.Equal("Host=teste;Database=fleet_test", conexao);
    }

    [Fact]
    public void ConnectionStrings_Default_dispensa_as_variaveis_POSTGRES()
    {
        var conexao = ConexaoBanco.Resolver(Config(("ConnectionStrings:Default", "Host=teste;Database=fleet_test")));

        Assert.Equal("Host=teste;Database=fleet_test", conexao);
    }

    [Fact]
    public void Sem_POSTGRES_PASSWORD_falha_com_mensagem_exata_e_sem_valores()
    {
        var itens = VariaveisCompletas().Where(i => i.Item1 != "POSTGRES_PASSWORD").ToArray();

        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => ConexaoBanco.Resolver(Config(itens)));

        Assert.Equal("Variáveis obrigatórias ausentes: POSTGRES_PASSWORD", erro.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Senha_vazia_ou_em_branco_conta_como_ausente(string valor)
    {
        var itens = VariaveisCompletas().Select(i => i.Item1 == "POSTGRES_PASSWORD" ? (i.Item1, (string?)valor) : i).ToArray();

        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => ConexaoBanco.Resolver(Config(itens)));

        Assert.Equal("Variáveis obrigatórias ausentes: POSTGRES_PASSWORD", erro.Message);
    }

    [Fact]
    public void ConnectionStrings_Default_em_branco_nao_ignora_a_validacao()
    {
        var erro = Assert.Throws<ConfiguracaoInvalidaException>(
            () => ConexaoBanco.Resolver(Config(("ConnectionStrings:Default", "  "))));

        Assert.Equal(
            "Variáveis obrigatórias ausentes: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD",
            erro.Message);
    }

    [Fact]
    public void Lista_todas_as_variaveis_ausentes()
    {
        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => ConexaoBanco.Resolver(Config(("POSTGRES_HOST", "db"))));

        Assert.Equal("Variáveis obrigatórias ausentes: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD", erro.Message);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("0")]
    [InlineData("70000")]
    public void Porta_invalida_falha_sem_ecoar_o_valor(string porta)
    {
        var itens = VariaveisCompletas().Select(i => i.Item1 == "POSTGRES_PORT" ? (i.Item1, (string?)porta) : i).ToArray();

        var erro = Assert.Throws<ConfiguracaoInvalidaException>(() => ConexaoBanco.Resolver(Config(itens)));

        Assert.Contains("POSTGRES_PORT", erro.Message);
        Assert.DoesNotContain(porta, erro.Message);
    }

    [Fact]
    public async Task Subida_sem_POSTGRES_PASSWORD_encerra_com_codigo_diferente_de_zero_e_sem_imprimir_valores()
    {
        const string usuario = "usuario-sentinela";
        const string banco = "banco-sentinela";
        var dll = Path.Combine(AppContext.BaseDirectory, "FleetApi.dll");
        var inicio = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        inicio.ArgumentList.Add(dll);
        inicio.Environment.Remove("ConnectionStrings__Default");
        inicio.Environment.Remove("POSTGRES_PASSWORD");
        inicio.Environment["POSTGRES_HOST"] = "host-sentinela";
        inicio.Environment["POSTGRES_PORT"] = "5432";
        inicio.Environment["POSTGRES_DB"] = banco;
        inicio.Environment["POSTGRES_USER"] = usuario;
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
            throw new Xunit.Sdk.XunitException("A API não encerrou: deveria falhar cedo sem POSTGRES_PASSWORD.");
        }

        var texto = await saida + await erro;
        Assert.NotEqual(0, processo.ExitCode);
        Assert.Contains("Variáveis obrigatórias ausentes: POSTGRES_PASSWORD", texto);
        Assert.DoesNotContain("host-sentinela", texto);
        Assert.DoesNotContain(usuario, texto);
        Assert.DoesNotContain(banco, texto);
    }
}
