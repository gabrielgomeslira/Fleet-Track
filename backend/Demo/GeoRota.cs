using System.Text.Json;

namespace FleetApi.Demo;

/// <summary>
/// Linha de uma rota (GeoJSON <c>LineString</c>, <c>[longitude, latitude]</c>) com a distância
/// acumulada de cada ponto, para andar por ela e para descobrir em que ponto dela um veículo está.
/// </summary>
/// <remarks>
/// Distâncias em metros, por Haversine. A interpolação é linear em longitude e latitude dentro de
/// cada trecho, parametrizada pela distância do trecho. A projeção usa o mesmo parâmetro (plano
/// local do trecho, onde a interpolação linear continua linear), então
/// <c>Projetar(Interpolar(d)) == d</c> a menos de arredondamento: o job pode guardar só a posição
/// (ADR-0016 item 14, D5 da seção 4.10) e retomar de onde parou.
/// </remarks>
public sealed class GeoRota
{
    private const double RaioDaTerraEmMetros = 6_371_008.8;
    private const double MetrosPorGrau = RaioDaTerraEmMetros * Math.PI / 180;

    private readonly Ponto[] _pontos;
    private readonly double[] _acumulado; // metros do início da linha até o ponto i

    public GeoRota(IReadOnlyList<Ponto> pontos)
    {
        ArgumentNullException.ThrowIfNull(pontos);
        if (pontos.Count < 2)
        {
            throw new ArgumentException("Uma rota precisa de pelo menos 2 pontos.", nameof(pontos));
        }

        _pontos = [.. pontos];
        _acumulado = new double[_pontos.Length];
        for (var i = 1; i < _pontos.Length; i++)
        {
            _acumulado[i] = _acumulado[i - 1] + Distancia(_pontos[i - 1], _pontos[i]);
        }
    }

    public IReadOnlyList<Ponto> Pontos => _pontos;

    public Ponto Inicio => _pontos[0];

    public Ponto Fim => _pontos[^1];

    public double ComprimentoEmMetros => _acumulado[^1];

    /// <summary>Distância na superfície da Terra entre dois pontos, em metros (Haversine).</summary>
    public static double Distancia(Ponto a, Ponto b)
    {
        var lat1 = Radianos(a.Latitude);
        var lat2 = Radianos(b.Latitude);
        var dLat = lat2 - lat1;
        var dLon = Radianos(b.Longitude - a.Longitude);

        var h = Math.Pow(Math.Sin(dLat / 2), 2)
            + Math.Cos(lat1) * Math.Cos(lat2) * Math.Pow(Math.Sin(dLon / 2), 2);
        return 2 * RaioDaTerraEmMetros * Math.Asin(Math.Min(1, Math.Sqrt(h)));
    }

    /// <summary>
    /// Lê o texto de <c>deliveries.route_path</c>. Devolve nulo se não for um <c>LineString</c> válido
    /// com 2 pontos ou mais: quem chama trata como "sem rota" e nunca inventa posição.
    /// </summary>
    public static GeoRota? DeGeoJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var documento = JsonDocument.Parse(json);
            var raiz = documento.RootElement;
            if (raiz.ValueKind != JsonValueKind.Object
                || !raiz.TryGetProperty("type", out var tipo) || tipo.GetString() != "LineString"
                || !raiz.TryGetProperty("coordinates", out var coordenadas)
                || coordenadas.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var pontos = new List<Ponto>(coordenadas.GetArrayLength());
            foreach (var c in coordenadas.EnumerateArray())
            {
                if (c.ValueKind != JsonValueKind.Array || c.GetArrayLength() < 2
                    || c[0].ValueKind != JsonValueKind.Number || c[1].ValueKind != JsonValueKind.Number)
                {
                    return null;
                }
                pontos.Add(new Ponto(c[0].GetDouble(), c[1].GetDouble()));
            }

            return pontos.Count >= 2 ? new GeoRota(pontos) : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Ponto a <paramref name="metros"/> do início, preso entre o início e o fim da linha.</summary>
    public Ponto Interpolar(double metros)
    {
        if (metros <= 0)
        {
            return Inicio;
        }
        if (metros >= ComprimentoEmMetros)
        {
            return Fim;
        }

        // Último trecho que começa em ou antes de "metros". Trechos de tamanho zero (pontos
        // repetidos) nunca são escolhidos: o seguinte começa na mesma distância.
        var i = Array.BinarySearch(_acumulado, metros);
        if (i < 0)
        {
            i = ~i - 1;
        }
        else
        {
            while (i + 1 < _acumulado.Length && _acumulado[i + 1] == _acumulado[i])
            {
                i++;
            }
        }
        i = Math.Min(i, _pontos.Length - 2);

        var tamanho = _acumulado[i + 1] - _acumulado[i];
        if (tamanho <= 0)
        {
            return _pontos[i];
        }

        var fracao = (metros - _acumulado[i]) / tamanho;
        var a = _pontos[i];
        var b = _pontos[i + 1];
        return new Ponto(
            a.Longitude + fracao * (b.Longitude - a.Longitude),
            a.Latitude + fracao * (b.Latitude - a.Latitude));
    }

    /// <summary>
    /// Distância, em metros desde o início, do ponto da linha mais próximo de <paramref name="ponto"/>.
    /// Vale para rotas sem autointerseção (garantido em teste para os corredores da demo).
    /// </summary>
    public double Projetar(Ponto ponto)
    {
        var melhorDistancia2 = double.MaxValue;
        var melhorAoLongo = 0.0;

        for (var i = 0; i < _pontos.Length - 1; i++)
        {
            var tamanho = _acumulado[i + 1] - _acumulado[i];
            if (tamanho <= 0)
            {
                continue;
            }

            var a = _pontos[i];
            var b = _pontos[i + 1];

            // Plano local do trecho, em metros: x cresce para leste, y para norte.
            var escalaX = Math.Cos(Radianos((a.Latitude + b.Latitude) / 2)) * MetrosPorGrau;
            var bx = (b.Longitude - a.Longitude) * escalaX;
            var by = (b.Latitude - a.Latitude) * MetrosPorGrau;
            var px = (ponto.Longitude - a.Longitude) * escalaX;
            var py = (ponto.Latitude - a.Latitude) * MetrosPorGrau;

            var t = Math.Clamp((px * bx + py * by) / (bx * bx + by * by), 0, 1);
            var dx = px - t * bx;
            var dy = py - t * by;
            var distancia2 = dx * dx + dy * dy;

            if (distancia2 < melhorDistancia2)
            {
                melhorDistancia2 = distancia2;
                melhorAoLongo = _acumulado[i] + t * tamanho;
            }
        }

        return melhorAoLongo;
    }

    private static double Radianos(double graus) => graus * Math.PI / 180;
}
