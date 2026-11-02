using FleetApi.Models;

namespace FleetApi.Tests.Infra;

/// <summary>Construtores de dados de teste. Cada chamada cria registros com GUID novo.</summary>
public static class Dados
{
    public static Vehicle Veiculo(string placa, string status = "parado", double? velocidade = null) => new()
    {
        Id = Guid.NewGuid(),
        Plate = placa,
        Model = "Modelo",
        DriverName = "Motorista",
        Status = status,
        Speed = velocidade,
        UpdatedAt = DateTime.UtcNow,
    };

    public static Delivery Entrega(Vehicle veiculo, string status = "pendente", DateTime? criadaEm = null,
        DateTime? entregueEm = null) => new()
    {
        Id = Guid.NewGuid(),
        VehicleId = veiculo.Id,
        Origin = "Origem",
        Destination = "Destino",
        Status = status,
        CreatedAt = criadaEm ?? DateTime.UtcNow,
        DeliveredAt = entregueEm,
    };

    public static async Task GravarAsync(params object[] entidades)
    {
        await using var db = DbFixture.CriarContexto();
        db.AddRange(entidades);
        await db.SaveChangesAsync();
    }
}
