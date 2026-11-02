namespace FleetApi.Models;

public class TelemetryRecord
{
    public Guid Id { get; set; }
    public Guid VehicleId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    /// <summary>Anuláveis: a ingestão aceita leitura sem velocidade ou sem combustível. Posição, não.</summary>
    public double? Speed { get; set; }
    public int? FuelLevel { get; set; }
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;

    public Vehicle Vehicle { get; set; } = null!;
}
