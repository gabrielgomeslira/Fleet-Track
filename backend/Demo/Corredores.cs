using System.Reflection;
using System.Text;
using System.Text.Json;

namespace FleetApi.Demo;

/// <summary>Ponto de um trajeto, na ordem do GeoJSON (RFC 7946): longitude primeiro.</summary>
public readonly record struct Ponto(double Longitude, double Latitude);

/// <summary>
/// Trajeto predefinido entre duas cidades. <see cref="Sedes"/> nomeia, na ordem, as sedes de
/// município por onde a linha passa (uma por ponto), só para conferência humana do arquivo.
/// </summary>
public sealed record Corredor(
    string Id, string Origem, string Destino, IReadOnlyList<string> Sedes, IReadOnlyList<Ponto> Pontos)
{
    /// <summary>GeoJSON <c>LineString</c> em texto, pronto para a coluna <c>deliveries.route_path</c>.</summary>
    public string GeoJson => Corredores.ParaGeoJson(Pontos);
}

/// <summary>
/// Corredores da demo (ADR-0016 item 14): recurso embutido <c>corredores.json</c>, com sequências de
/// sedes de município escritas à mão. Não vêm do OSM nem de serviço de rotas (ODbL e PRD). Por isso
/// a linha é o trajeto entre cidades e não segue as ruas.
/// </summary>
/// <remarks>
/// A carga valida o formato e falha cedo. Mensagens de erro citam o corredor e o motivo, nunca as
/// coordenadas. A geometria (autointerseção, ângulo de virada) é conferida em teste.
/// </remarks>
public static class Corredores
{
    public const int MinimoDePontos = 2;
    public const int MaximoDePontos = 200;

    // Caixa do Brasil continental e insular (arredondada para fora). Latitude e longitude não
    // se sobrepõem nessa caixa, então uma inversão de ordem sempre é rejeitada.
    public const double LatitudeMinima = -33.75, LatitudeMaxima = 5.30;
    public const double LongitudeMinima = -73.99, LongitudeMaxima = -34.79;

    private const string NomeDoRecurso = "corredores.json";
    private const int TamanhoMaximoDoTexto = 200; // mesmo limite de deliveries.origin e destination

    private static readonly Lazy<IReadOnlyList<Corredor>> Embutidos = new(CarregarEmbutidos);

    /// <summary>Todos os corredores embutidos. Falha na primeira leitura se o arquivo for inválido.</summary>
    public static IReadOnlyList<Corredor> Todos => Embutidos.Value;

    /// <summary>Corredor cujo texto de origem e destino é exatamente o da entrega, ou nulo.</summary>
    public static Corredor? Procurar(string origem, string destino) =>
        Todos.FirstOrDefault(c => c.Origem == origem && c.Destino == destino);

    /// <summary>Como <see cref="Procurar"/>, mas a ausência é erro de configuração da demo.</summary>
    public static Corredor Obter(string origem, string destino) =>
        Procurar(origem, destino)
        ?? throw new InvalidOperationException(
            $"Não há corredor da demo para a entrega '{origem}' -> '{destino}'. Inclua-o em {NomeDoRecurso}.");

    public static IReadOnlyList<Corredor> Carregar(Stream json)
    {
        JsonDocument documento;
        try
        {
            documento = JsonDocument.Parse(json);
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException($"{NomeDoRecurso} não é um JSON válido: {ex.Message}", ex);
        }

        using (documento)
        {
            if (documento.RootElement.ValueKind != JsonValueKind.Object
                || !documento.RootElement.TryGetProperty("corredores", out var lista)
                || lista.ValueKind != JsonValueKind.Array
                || lista.GetArrayLength() == 0)
            {
                throw new InvalidDataException($"{NomeDoRecurso} precisa de uma lista 'corredores' não vazia.");
            }

            var corredores = lista.EnumerateArray().Select((e, i) => LerCorredor(e, i)).ToList();

            var repetido = corredores.GroupBy(c => c.Id).FirstOrDefault(g => g.Count() > 1);
            if (repetido is not null)
            {
                throw new InvalidDataException($"{NomeDoRecurso}: id de corredor repetido '{repetido.Key}'.");
            }

            var trecho = corredores.GroupBy(c => (c.Origem, c.Destino)).FirstOrDefault(g => g.Count() > 1);
            if (trecho is not null)
            {
                throw new InvalidDataException(
                    $"{NomeDoRecurso}: mais de um corredor para '{trecho.Key.Origem}' -> '{trecho.Key.Destino}'.");
            }

            return corredores;
        }
    }

    /// <summary>Serializa como GeoJSON <c>LineString</c> (RFC 7946), <c>[longitude, latitude]</c>.</summary>
    public static string ParaGeoJson(IReadOnlyList<Ponto> pontos)
    {
        using var saida = new MemoryStream();
        using (var escritor = new Utf8JsonWriter(saida))
        {
            escritor.WriteStartObject();
            escritor.WriteString("type", "LineString");
            escritor.WriteStartArray("coordinates");
            foreach (var p in pontos)
            {
                escritor.WriteStartArray();
                escritor.WriteNumberValue(p.Longitude);
                escritor.WriteNumberValue(p.Latitude);
                escritor.WriteEndArray();
            }
            escritor.WriteEndArray();
            escritor.WriteEndObject();
        }
        return Encoding.UTF8.GetString(saida.ToArray());
    }

    private static IReadOnlyList<Corredor> CarregarEmbutidos()
    {
        using var fluxo = typeof(Corredores).Assembly.GetManifestResourceStream(NomeDoRecurso)
            ?? throw new InvalidOperationException($"Recurso embutido '{NomeDoRecurso}' não encontrado.");
        return Carregar(fluxo);
    }

    private static Corredor LerCorredor(JsonElement e, int indice)
    {
        var rotulo = $"corredor #{indice}";
        var id = Texto(e, "id", rotulo);
        rotulo = $"corredor '{id}'";
        var origem = Texto(e, "origem", rotulo);
        var destino = Texto(e, "destino", rotulo);

        if (!e.TryGetProperty("sedes", out var sedesJson) || sedesJson.ValueKind != JsonValueKind.Array)
        {
            throw Invalido(rotulo, "falta a lista 'sedes'");
        }
        var sedes = sedesJson.EnumerateArray()
            .Select(s => s.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(s.GetString())
                ? s.GetString()!
                : throw Invalido(rotulo, "'sedes' só aceita texto não vazio"))
            .ToList();

        if (!e.TryGetProperty("rota", out var rota) || rota.ValueKind != JsonValueKind.Object
            || !rota.TryGetProperty("type", out var tipo) || tipo.GetString() != "LineString")
        {
            throw Invalido(rotulo, "'rota' precisa ser um GeoJSON LineString");
        }
        if (!rota.TryGetProperty("coordinates", out var coordenadas) || coordenadas.ValueKind != JsonValueKind.Array)
        {
            throw Invalido(rotulo, "'rota' sem 'coordinates'");
        }

        var total = coordenadas.GetArrayLength();
        if (total is < MinimoDePontos or > MaximoDePontos)
        {
            throw Invalido(rotulo, $"a rota tem {total} pontos; o permitido é de {MinimoDePontos} a {MaximoDePontos}");
        }
        if (sedes.Count != total)
        {
            throw Invalido(rotulo, $"{sedes.Count} sedes para {total} pontos");
        }

        var pontos = new List<Ponto>(total);
        var posicao = 0;
        foreach (var c in coordenadas.EnumerateArray())
        {
            posicao++;
            if (c.ValueKind != JsonValueKind.Array || c.GetArrayLength() != 2
                || c[0].ValueKind != JsonValueKind.Number || c[1].ValueKind != JsonValueKind.Number)
            {
                throw Invalido(rotulo, $"o ponto {posicao} não é [longitude, latitude]");
            }

            var longitude = c[0].GetDouble();
            var latitude = c[1].GetDouble();
            if (longitude is < LongitudeMinima or > LongitudeMaxima || latitude is < LatitudeMinima or > LatitudeMaxima)
            {
                throw Invalido(rotulo, $"o ponto {posicao} está fora do Brasil ou na ordem trocada (use [longitude, latitude])");
            }
            pontos.Add(new Ponto(longitude, latitude));
        }

        return new Corredor(id, origem, destino, sedes, pontos);
    }

    private static string Texto(JsonElement e, string nome, string rotulo)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(nome, out var valor)
            || valor.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(valor.GetString()))
        {
            throw Invalido(rotulo, $"falta '{nome}' (texto não vazio)");
        }
        var texto = valor.GetString()!;
        return texto.Length <= TamanhoMaximoDoTexto
            ? texto
            : throw Invalido(rotulo, $"'{nome}' passa de {TamanhoMaximoDoTexto} caracteres");
    }

    private static InvalidDataException Invalido(string rotulo, string motivo) =>
        new($"{NomeDoRecurso}, {rotulo}: {motivo}.");
}
