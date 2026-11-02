using System.Text;
using System.Text.Json;
using FleetApi.Demo;
using Xunit;

namespace FleetApi.Tests;

/// <summary>
/// T-95: os trajetos da demo. Sem banco. A geometria é conferida aqui, para todo corredor
/// embutido, porque a H-24 depende dela (curva fechada derruba a distância em linha reta).
/// </summary>
public sealed class CorredoresTests
{
    // Máximo de virada em um vértice. A 90° a razão reta/percorrida cai para ~0,71 e a H-24 (±20%) reprova.
    private const double ViradaMaximaGraus = 70;

    // Folga entre a ponta do corredor e a sede da cidade do texto da entrega.
    private const double FolgaDaSedeKm = 15;

    // Referência independente do corredores.json: coordenadas aproximadas (latitude, longitude)
    // das sedes de município citadas no texto das entregas.
    private static readonly Dictionary<string, (double Latitude, double Longitude)> Sedes = new()
    {
        ["São Paulo, SP"] = (-23.5505, -46.6333),
        ["Rio de Janeiro, RJ"] = (-22.9068, -43.1729),
        ["Belo Horizonte, MG"] = (-19.9167, -43.9345),
        ["Brasília, DF"] = (-15.7801, -47.9292),
        ["Ribeirão Preto, SP"] = (-21.1775, -47.8103),
        ["São José do Rio Preto, SP"] = (-20.8113, -49.3758),
        ["Goiânia, GO"] = (-16.6869, -49.2648),
        ["Salvador, BA"] = (-12.9714, -38.5014),
        ["Recife, PE"] = (-8.0476, -34.8770),
        ["Curitiba, PR"] = (-25.4284, -49.2733),
        ["Florianópolis, SC"] = (-27.5954, -48.5480),
        ["Porto Alegre, RS"] = (-30.0346, -51.2177),
        ["Caxias do Sul, RS"] = (-29.1678, -51.1794),
    };

    public static TheoryData<string> IdsDosCorredores()
    {
        var dados = new TheoryData<string>();
        foreach (var c in Corredores.Todos)
        {
            dados.Add(c.Id);
        }
        return dados;
    }

    private static Corredor Corredor(string id) => Corredores.Todos.Single(c => c.Id == id);

    [Fact]
    public void Ha_corredores_para_as_oito_entregas_em_andamento_e_para_as_retomadas()
    {
        var trechos = Corredores.Todos.Select(c => (c.Origem, c.Destino)).ToList();

        // 8 trechos de ida (as 8 entregas em andamento) e os 6 de volta (retomadas).
        Assert.True(Corredores.Todos.Count >= 14, "faltam corredores para as entregas em andamento e as retomadas");
        Assert.Equal(trechos.Count, trechos.Distinct().Count());
        Assert.Equal(Corredores.Todos.Count, Corredores.Todos.Select(c => c.Id).Distinct().Count());
        // Seis idas têm o trecho de volta, para o veículo retomar depois de entregar.
        Assert.True(Corredores.Todos.Count(c => trechos.Contains((c.Destino, c.Origem))) >= 12);
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void Corredor_tem_de_2_a_200_pontos_dentro_do_Brasil_na_ordem_longitude_latitude(string id)
    {
        var corredor = Corredor(id);

        Assert.InRange(corredor.Pontos.Count, Corredores.MinimoDePontos, Corredores.MaximoDePontos);
        Assert.Equal(corredor.Pontos.Count, corredor.Sedes.Count);
        Assert.All(corredor.Pontos, p =>
        {
            Assert.InRange(p.Longitude, Corredores.LongitudeMinima, Corredores.LongitudeMaxima);
            Assert.InRange(p.Latitude, Corredores.LatitudeMinima, Corredores.LatitudeMaxima);
        });
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void Corredor_nao_se_cruza_nem_repete_ponto(string id)
    {
        var p = Corredor(id).Pontos;

        Assert.Equal(p.Count, p.Distinct().Count());
        for (var i = 0; i < p.Count - 1; i++)
        {
            // Trechos vizinhos compartilham um vértice; os demais não podem se tocar.
            for (var j = i + 2; j < p.Count - 1; j++)
            {
                Assert.False(Cruzam(p[i], p[i + 1], p[j], p[j + 1]),
                    $"{id}: o trecho {i}-{i + 1} cruza o trecho {j}-{j + 1}");
            }
        }
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void Angulo_de_virada_em_cada_vertice_nao_passa_de_70_graus(string id)
    {
        var p = Corredor(id).Pontos;

        for (var i = 1; i < p.Count - 1; i++)
        {
            var virada = AnguloDeVirada(p[i - 1], p[i], p[i + 1]);
            Assert.True(virada <= ViradaMaximaGraus,
                $"{id}: virada de {virada:F1}° no vértice {i} ({Corredor(id).Sedes[i]})");
        }
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void Origem_e_destino_batem_com_o_texto_da_entrega(string id)
    {
        var corredor = Corredor(id);

        Assert.True(Sedes.ContainsKey(corredor.Origem), $"Sem referência de sede para '{corredor.Origem}'");
        Assert.True(Sedes.ContainsKey(corredor.Destino), $"Sem referência de sede para '{corredor.Destino}'");
        Assert.InRange(DistanciaKm(corredor.Pontos[0], Sedes[corredor.Origem]), 0, FolgaDaSedeKm);
        Assert.InRange(DistanciaKm(corredor.Pontos[^1], Sedes[corredor.Destino]), 0, FolgaDaSedeKm);
    }

    [Theory]
    [MemberData(nameof(IdsDosCorredores))]
    public void GeoJson_do_corredor_e_uma_LineString_com_as_mesmas_coordenadas(string id)
    {
        var corredor = Corredor(id);

        using var json = JsonDocument.Parse(corredor.GeoJson);
        var raiz = json.RootElement;
        var coordenadas = raiz.GetProperty("coordinates").EnumerateArray()
            .Select(c => new Ponto(c[0].GetDouble(), c[1].GetDouble())).ToList();

        Assert.Equal("LineString", raiz.GetProperty("type").GetString());
        Assert.Equal(corredor.Pontos, coordenadas);
    }

    [Fact]
    public void Procurar_acha_pelo_texto_exato_e_devolve_nulo_para_trecho_desconhecido()
    {
        Assert.Equal("sp-rj", Corredores.Procurar("São Paulo, SP", "Rio de Janeiro, RJ")?.Id);
        Assert.Null(Corredores.Procurar("São Paulo, SP", "Manaus, AM"));
        Assert.Throws<InvalidOperationException>(() => Corredores.Obter("São Paulo, SP", "Manaus, AM"));
    }

    // ---- validação da carga (entradas inválidas) ----

    [Fact]
    public void Carga_rejeita_latitude_e_longitude_trocadas()
    {
        // [lat, lon] em vez de [lon, lat]: -23.55 como longitude passa de -34.79 e -46.63 como
        // latitude passa de -33.75. As faixas não se sobrepõem, então a troca sempre é detectada.
        var erro = CarregarComRota("[[-23.55, -46.63], [-22.90, -43.17]]");

        Assert.Contains("fora do Brasil ou na ordem trocada", erro.Message);
    }

    [Theory]
    [InlineData("[[-46.63, -23.55]]", "tem 1 pontos")]
    [InlineData("[]", "tem 0 pontos")]
    public void Carga_rejeita_menos_de_2_pontos(string coordenadas, string trecho)
    {
        var erro = CarregarComRota(coordenadas, sedes: coordenadas == "[]" ? "[]" : "[\"A\"]");

        Assert.Contains(trecho, erro.Message);
    }

    [Fact]
    public void Carga_rejeita_mais_de_200_pontos()
    {
        var pontos = Enumerable.Range(0, 201).Select(PontoDeTeste);
        var sedes = string.Join(",", Enumerable.Range(0, 201).Select(i => $"\"S{i}\""));

        var erro = CarregarComRota("[" + string.Join(",", pontos) + "]", sedes: "[" + sedes + "]");

        Assert.Contains("tem 201 pontos", erro.Message);
    }

    [Fact]
    public void Carga_aceita_200_pontos()
    {
        var pontos = Enumerable.Range(0, 200).Select(PontoDeTeste);
        var sedes = string.Join(",", Enumerable.Range(0, 200).Select(i => $"\"S{i}\""));

        var corredores = Carregar(Json("[" + string.Join(",", pontos) + "]", "[" + sedes + "]"));

        Assert.Equal(200, Assert.Single(corredores).Pontos.Count);
    }

    [Fact]
    public void Carga_rejeita_ponto_fora_do_Brasil()
    {
        var erro = CarregarComRota("[[-46.63, -23.55], [2.35, 48.85]]");

        Assert.Contains("ponto 2", erro.Message);
        Assert.DoesNotContain("48.85", erro.Message); // o conteúdo da rota não vai para mensagem de erro
    }

    [Fact]
    public void Carga_rejeita_sedes_em_numero_diferente_dos_pontos()
    {
        var erro = CarregarComRota("[[-46.63, -23.55], [-43.17, -22.90]]", sedes: "[\"A\"]");

        Assert.Contains("1 sedes para 2 pontos", erro.Message);
    }

    [Fact]
    public void Carga_rejeita_geometria_que_nao_e_LineString()
    {
        var json = Json("[[-46.63, -23.55], [-43.17, -22.90]]", "[\"A\",\"B\"]").Replace("LineString", "Polygon");

        Assert.Contains("LineString", Assert.Throws<InvalidDataException>(() => Carregar(json)).Message);
    }

    [Fact]
    public void Carga_rejeita_id_ou_trecho_repetido()
    {
        var um = CorredorJson("a", "O, SP", "D, SP");
        var mesmoId = CorredorJson("a", "X, SP", "Y, SP");
        var mesmoTrecho = CorredorJson("b", "O, SP", "D, SP");

        Assert.Contains("id de corredor repetido",
            Assert.Throws<InvalidDataException>(() => Carregar($"{{\"corredores\":[{um},{mesmoId}]}}")).Message);
        Assert.Contains("mais de um corredor",
            Assert.Throws<InvalidDataException>(() => Carregar($"{{\"corredores\":[{um},{mesmoTrecho}]}}")).Message);
    }

    [Theory]
    [InlineData("não é json")]
    [InlineData("{}")]
    [InlineData("{\"corredores\":[]}")]
    public void Carga_rejeita_arquivo_malformado(string json)
    {
        Assert.Throws<InvalidDataException>(() => Carregar(json));
    }

    // ---- auxiliares ----

    // Cultura invariante: em pt-BR o ponto decimal viraria vírgula e o JSON ficaria inválido.
    private static string PontoDeTeste(int i) =>
        string.Create(System.Globalization.CultureInfo.InvariantCulture, $"[{-46.0 - i * 0.001:F3}, -23.5]");

    private static IReadOnlyList<Corredor> Carregar(string json) =>
        Corredores.Carregar(new MemoryStream(Encoding.UTF8.GetBytes(json)));

    private static InvalidDataException CarregarComRota(string coordenadas, string sedes = "[\"A\",\"B\"]") =>
        Assert.Throws<InvalidDataException>(() => Carregar(Json(coordenadas, sedes)));

    private static string Json(string coordenadas, string sedes) =>
        $"{{\"corredores\":[{CorredorJson("a", "O, SP", "D, SP", coordenadas, sedes)}]}}";

    private static string CorredorJson(
        string id, string origem, string destino,
        string coordenadas = "[[-46.63, -23.55], [-43.17, -22.90]]", string sedes = "[\"A\",\"B\"]") =>
        $"{{\"id\":\"{id}\",\"origem\":\"{origem}\",\"destino\":\"{destino}\",\"sedes\":{sedes}," +
        $"\"rota\":{{\"type\":\"LineString\",\"coordinates\":{coordenadas}}}}}";

    // Plano local em km (equirretangular), suficiente para trechos de centenas de km.
    private static (double X, double Y) Plano(Ponto p, double latitudeReferencia) =>
        (p.Longitude * 111.19 * Math.Cos(latitudeReferencia * Math.PI / 180), p.Latitude * 111.19);

    private static double AnguloDeVirada(Ponto a, Ponto b, Ponto c)
    {
        var lat = (a.Latitude + c.Latitude) / 2;
        var (ax, ay) = Plano(a, lat);
        var (bx, by) = Plano(b, lat);
        var (cx, cy) = Plano(c, lat);
        double ux = bx - ax, uy = by - ay, vx = cx - bx, vy = cy - by;
        var cos = (ux * vx + uy * vy) / (Math.Sqrt(ux * ux + uy * uy) * Math.Sqrt(vx * vx + vy * vy));
        return Math.Acos(Math.Clamp(cos, -1, 1)) * 180 / Math.PI;
    }

    private static double DistanciaKm(Ponto p, (double Latitude, double Longitude) sede)
    {
        var lat = (p.Latitude + sede.Latitude) / 2;
        var (px, py) = Plano(p, lat);
        var (sx, sy) = Plano(new Ponto(sede.Longitude, sede.Latitude), lat);
        return Math.Sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy));
    }

    // Interseção própria de dois segmentos (cruzamento em X). Toque em ponta entre trechos não vizinhos
    // exigiria ponto repetido, que outro teste já proíbe.
    private static bool Cruzam(Ponto p1, Ponto p2, Ponto p3, Ponto p4)
    {
        static double Lado(Ponto a, Ponto b, Ponto c) =>
            (b.Latitude - a.Latitude) * (c.Longitude - b.Longitude) - (b.Longitude - a.Longitude) * (c.Latitude - b.Latitude);

        return Lado(p1, p2, p3) * Lado(p1, p2, p4) < 0 && Lado(p3, p4, p1) * Lado(p3, p4, p2) < 0;
    }
}
