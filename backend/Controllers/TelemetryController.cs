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
        if (!await _db.Vehicles.AnyAsync(v => v.Id == vehicleId))
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Veiculo nao encontrado.");

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
}
