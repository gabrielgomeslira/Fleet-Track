using FleetApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TelemetryController : ControllerBase
{
    private readonly AppDbContext _db;

    public TelemetryController(AppDbContext db) => _db = db;

    [HttpGet("{vehicleId:guid}")]
    public async Task<IActionResult> GetByVehicle(Guid vehicleId)
    {
        var records = await _db.TelemetryRecords
            .Where(t => t.VehicleId == vehicleId)
            .OrderByDescending(t => t.RecordedAt)
            .Take(50)
            .Select(t => new
            {
                t.Id,
                t.Latitude,
                t.Longitude,
                t.Speed,
                t.FuelLevel,
                t.RecordedAt
            })
            .ToListAsync();

        return Ok(records);
    }

    [HttpPost("simulate")]
    public async Task<IActionResult> Simulate()
    {
        var rng = new Random();
        var vehicles = await _db.Vehicles
            .Where(v => v.Status == "em_rota")
            .ToListAsync();

        foreach (var v in vehicles)
        {
            v.Latitude += (rng.NextDouble() - 0.5) * 0.02;
            v.Longitude += (rng.NextDouble() - 0.5) * 0.02;
            v.Speed = 40 + rng.NextDouble() * 60;
            v.FuelLevel = Math.Max(5, v.FuelLevel - rng.Next(0, 2));
            v.UpdatedAt = DateTime.UtcNow;

            _db.TelemetryRecords.Add(new FleetApi.Models.TelemetryRecord
            {
                VehicleId = v.Id,
                Latitude = v.Latitude,
                Longitude = v.Longitude,
                Speed = v.Speed,
                FuelLevel = v.FuelLevel,
                RecordedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { updated = vehicles.Count });
    }
}
