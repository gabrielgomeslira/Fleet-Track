using FleetApi.Demo;
using Xunit;

namespace FleetApi.Tests;

/// <summary>T-35: regra de movimento e geometria da rota. Sem banco, sem relógio e sem sorteio.</summary>
public sealed class MotorDemoTests
{
    private static readonly TimeSpan Ciclo = TimeSpan.FromSeconds(30);

    // 60 km/h durante 30 s.
    private const double MetrosPorCiclo = 500;

    private static GeoRota Corredor(string id) =>
        new(Corredores.Todos.Single(c => c.Id == id).Pontos);

    private static EstadoVeiculo NoInicio(GeoRota rota, double velocidade = 0, int combustivel = 80) =>
        new(rota.Inicio.Latitude, rota.Inicio.Longitude, velocidade, combustivel);

    private static double Distancia(EstadoVeiculo a, EstadoVeiculo b) =>
        GeoRota.Distancia(new Ponto(a.Longitude, a.Latitude), new Ponto(b.Longitude, b.Latitude));

    [Fact]
    public void Haversine_de_um_grau_de_latitude_da_cerca_de_111_km()
    {
        var metros = GeoRota.Distancia(new Ponto(-46, -23), new Ponto(-46, -24));

        Assert.InRange(metros, 111_000, 111_400);
    }

    [Fact]
    public void Sem_rota_o_veiculo_fica_parado_com_velocidade_zero_e_posicao_constante()
    {
        var antes = new EstadoVeiculo(-23.5505, -46.6333, 72.5, 68);

        var depois = MotorDemo.Avancar(antes, null, Ciclo);

        Assert.Equal(antes with { VelocidadeKmH = 0 }, depois);
    }

    [Fact]
    public void Com_rota_anda_60_km_por_hora_por_30_s_ou_seja_500_m()
    {
        var rota = Corredor("sp-rj");
        var antes = NoInicio(rota);

        var depois = MotorDemo.Avancar(antes, rota, Ciclo);

        Assert.Equal(60, depois.VelocidadeKmH);
        Assert.InRange(Distancia(antes, depois), MetrosPorCiclo - 5, MetrosPorCiclo + 5);
        Assert.Equal(antes.Combustivel, depois.Combustivel);
    }

    [Fact]
    public void Mesmo_estado_e_mesma_rota_dao_sempre_o_mesmo_resultado()
    {
        var rota = Corredor("sp-rj");
        var antes = NoInicio(rota);

        Assert.Equal(MotorDemo.Avancar(antes, rota, Ciclo), MotorDemo.Avancar(antes, rota, Ciclo));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(1_234.5)]
    [InlineData(250_000)]
    public void Projetar_desfaz_Interpolar_em_qualquer_ponto_da_rota(double metros)
    {
        var rota = Corredor("sp-rj");
        Assert.True(metros < rota.ComprimentoEmMetros);

        var ponto = rota.Interpolar(metros);

        Assert.Equal(metros, rota.Projetar(ponto), precision: 3);
    }

    [Fact]
    public void Interpolar_prende_o_resultado_entre_o_inicio_e_o_fim()
    {
        var rota = Corredor("sp-rj");

        Assert.Equal(rota.Inicio, rota.Interpolar(-10));
        Assert.Equal(rota.Fim, rota.Interpolar(rota.ComprimentoEmMetros + 10));
    }

    [Fact]
    public void Projetar_leva_um_ponto_fora_da_linha_ao_ponto_mais_proximo_dela()
    {
        var rota = new GeoRota([new Ponto(-46.0, -23.0), new Ponto(-45.0, -23.0)]);
        var ladoDaLinha = new Ponto(-45.5, -23.01); // ~1,1 km ao sul do meio

        var aoLongo = rota.Projetar(ladoDaLinha);

        Assert.InRange(aoLongo, rota.ComprimentoEmMetros / 2 - 10, rota.ComprimentoEmMetros / 2 + 10);
    }

    [Fact]
    public void Ponto_repetido_na_rota_nao_quebra_a_interpolacao_nem_a_projecao()
    {
        var rota = new GeoRota([new Ponto(-46, -23), new Ponto(-46, -23), new Ponto(-45.99, -23)]);

        var meio = rota.Interpolar(rota.ComprimentoEmMetros / 2);

        Assert.Equal(rota.ComprimentoEmMetros / 2, rota.Projetar(meio), precision: 3);
    }

    [Fact]
    public void Rota_com_menos_de_dois_pontos_e_recusada()
    {
        Assert.Throws<ArgumentException>(() => new GeoRota([new Ponto(-46, -23)]));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("não é json")]
    [InlineData("""{"type":"Point","coordinates":[-46,-23]}""")]
    [InlineData("""{"type":"LineString","coordinates":[[-46,-23]]}""")]
    [InlineData("""{"type":"LineString","coordinates":[[-46,-23],["a","b"]]}""")]
    [InlineData("""{"type":"LineString"}""")]
    public void GeoJson_ilegivel_ou_curto_vira_sem_rota(string? json)
    {
        Assert.Null(GeoRota.DeGeoJson(json));
    }

    [Fact]
    public void GeoJson_do_corredor_volta_com_os_mesmos_pontos()
    {
        var corredor = Corredores.Todos[0];

        var rota = GeoRota.DeGeoJson(corredor.GeoJson);

        Assert.NotNull(rota);
        Assert.Equal(corredor.Pontos, rota.Pontos);
    }

    public static TheoryData<string> IdsDosCorredores()
    {
        var dados = new TheoryData<string>();
        foreach (var c in Corredores.Todos)
        {
            dados.Add(c.Id);
        }
        return dados;
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void Percorre_o_corredor_inteiro_sem_salto_nem_ziguezague_e_para_no_destino(string id)
    {
        var rota = Corredor(id);
        var estado = NoInicio(rota);
        var anterior = 0.0;
        var ciclos = 0;

        while (true)
        {
            var proximo = MotorDemo.Avancar(estado, rota, Ciclo);
            ciclos++;
            Assert.True(ciclos < 5_000, "o veículo nunca chegou ao destino");

            var passo = Distancia(estado, proximo);
            Assert.True(passo <= MetrosPorCiclo + 5, $"salto de {passo:F0} m no ciclo {ciclos}");

            // Anda sempre para a frente, na linha: o progresso ao longo da rota só cresce.
            var aoLongo = rota.Projetar(new Ponto(proximo.Longitude, proximo.Latitude));
            Assert.True(aoLongo > anterior, $"não avançou no ciclo {ciclos}");
            anterior = aoLongo;

            estado = proximo;
            if (estado.VelocidadeKmH == 0)
            {
                break;
            }
            Assert.Equal(60, estado.VelocidadeKmH);
        }

        // Chegou: no último ponto, parado, e assim permanece.
        Assert.Equal(rota.Fim.Latitude, estado.Latitude);
        Assert.Equal(rota.Fim.Longitude, estado.Longitude);
        Assert.Equal(estado, MotorDemo.Avancar(estado, rota, Ciclo));

        // O percurso levou o tempo de 60 km/h sobre o comprimento da rota (arredondado para cima).
        Assert.Equal(Math.Ceiling(rota.ComprimentoEmMetros / MetrosPorCiclo), ciclos);
    }

    [Fact]
    public void Distancia_de_dt_zero_ou_negativo_nao_move_o_veiculo()
    {
        var rota = Corredor("sp-rj");
        var antes = NoInicio(rota, velocidade: 60);

        Assert.Equal(antes with { VelocidadeKmH = 0 }, MotorDemo.Avancar(antes, rota, TimeSpan.Zero));
        Assert.Equal(antes with { VelocidadeKmH = 0 }, MotorDemo.Avancar(antes, rota, -Ciclo));
    }
}
