namespace FleetApi.Models;

public class Delivery
{
    public Guid Id { get; set; }
    public Guid VehicleId { get; set; }
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public string Status { get; set; } = "pendente";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeliveredAt { get; set; }

    /// <summary>
    /// Trajeto da entrega: GeoJSON <c>LineString</c> em texto, <c>[longitude, latitude]</c>
    /// (ADR-0016 item 12). Nulo fora da demo. Não entra em log nem no contrato até a T-104.
    /// </summary>
    public string? RoutePath { get; set; }

    public Vehicle Vehicle { get; set; } = null!;
}
