namespace FleetApi.Models;

public class Vehicle
{
    public Guid Id { get; set; }
    public string Plate { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public string Status { get; set; } = "parado";
    /// <summary>Nulos quando a posição expirou (retenção) ou o veículo nunca enviou uma.</summary>
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double Speed { get; set; }
    public int FuelLevel { get; set; } = 100;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Instante do último sinal recebido. Sobrevive ao expurgo da telemetria, que apaga a posição mas
    /// não este instante (H-12): é nele que o alerta "sem sinal" se apoia.
    /// </summary>
    public DateTime? LastSignalAt { get; set; }

    public List<Delivery> Deliveries { get; set; } = new();
    public List<TelemetryRecord> TelemetryRecords { get; set; } = new();
}
