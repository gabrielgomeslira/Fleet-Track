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

    public Vehicle Vehicle { get; set; } = null!;
}
