using FleetApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VehiclesController : ControllerBase
{
    private readonly AppDbContext _db;

    public VehiclesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var vehicles = await _db.Vehicles
            .OrderBy(v => v.Plate)
            .Select(v => new
            {
                v.Id,
                v.Plate,
                v.Model,
                v.DriverName,
                v.Status,
                v.Latitude,
                v.Longitude,
                v.Speed,
                v.FuelLevel,
                v.UpdatedAt
            })
            .ToListAsync();

        return Ok(vehicles);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var vehicle = await _db.Vehicles
            .Include(v => v.Deliveries.OrderByDescending(d => d.CreatedAt).Take(5))
            .FirstOrDefaultAsync(v => v.Id == id);

        if (vehicle is null)
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Veiculo nao encontrado.");

        return Ok(new
        {
            vehicle.Id,
            vehicle.Plate,
            vehicle.Model,
            vehicle.DriverName,
            vehicle.Status,
            vehicle.Latitude,
            vehicle.Longitude,
            vehicle.Speed,
            vehicle.FuelLevel,
            vehicle.UpdatedAt,
            Deliveries = vehicle.Deliveries.Select(d => new
            {
                d.Id,
                d.Origin,
                d.Destination,
                d.Status,
                d.CreatedAt,
                d.DeliveredAt
            })
        });
    }
}
