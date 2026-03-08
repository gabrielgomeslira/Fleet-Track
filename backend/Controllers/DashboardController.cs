using FleetApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;

    public DashboardController(AppDbContext db) => _db = db;

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var totalVehicles = await _db.Vehicles.CountAsync();
        var enRoute = await _db.Vehicles.CountAsync(v => v.Status == "em_rota");
        var stopped = await _db.Vehicles.CountAsync(v => v.Status == "parado");
        var maintenance = await _db.Vehicles.CountAsync(v => v.Status == "manutencao");

        var totalDeliveries = await _db.Deliveries.CountAsync();
        var delivered = await _db.Deliveries.CountAsync(d => d.Status == "entregue");
        var inTransit = await _db.Deliveries.CountAsync(d => d.Status == "em_transito");
        var pending = await _db.Deliveries.CountAsync(d => d.Status == "pendente");
        var cancelled = await _db.Deliveries.CountAsync(d => d.Status == "cancelado");

        var avgSpeed = await _db.Vehicles
            .Where(v => v.Status == "em_rota")
            .AverageAsync(v => (double?)v.Speed) ?? 0;

        var deliveryRate = totalDeliveries > 0
            ? Math.Round((double)delivered / totalDeliveries * 100, 1)
            : 0;

        var deliveriesPerDay = await _db.Deliveries
            .Where(d => d.DeliveredAt != null && d.DeliveredAt > DateTime.UtcNow.AddDays(-14))
            .GroupBy(d => d.DeliveredAt!.Value.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return Ok(new
        {
            totalVehicles,
            enRoute,
            stopped,
            maintenance,
            totalDeliveries,
            delivered,
            inTransit,
            pending,
            cancelled,
            avgSpeed = Math.Round(avgSpeed, 1),
            deliveryRate,
            deliveriesPerDay
        });
    }
}
