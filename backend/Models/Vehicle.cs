namespace FleetApi.Models;

public class Vehicle
{
    public Guid Id { get; set; }
    public string Plate { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public string Status { get; set; } = "parado";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double Speed { get; set; }
    public int FuelLevel { get; set; } = 100;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<Delivery> Deliveries { get; set; } = new();
    public List<TelemetryRecord> TelemetryRecords { get; set; } = new();
}
