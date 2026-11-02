using FleetApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DeliveriesController : ControllerBase
{
    private static readonly string[] StatusAceitos = ["pendente", "em_transito", "entregue", "cancelado"];

    private readonly AppDbContext _db;

    public DeliveriesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        if (!string.IsNullOrEmpty(status) && !StatusAceitos.Contains(status))
        {
            // Nao devolve o valor recebido: pode ser enorme ou conter caracteres de controle.
            ModelState.AddModelError(nameof(status),
                $"Valor invalido para 'status'. Valores aceitos: {string.Join(", ", StatusAceitos)}.");
            return ValidationProblem(ModelState);
        }

        var query = _db.Deliveries
            .Include(d => d.Vehicle)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status))
            query = query.Where(d => d.Status == status);

        var deliveries = await query
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new
            {
                d.Id,
                d.VehicleId,
                VehiclePlate = d.Vehicle.Plate,
                d.Origin,
                d.Destination,
                d.Status,
                d.CreatedAt,
                d.DeliveredAt
            })
            .ToListAsync();

        return Ok(deliveries);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var delivery = await _db.Deliveries
            .Include(d => d.Vehicle)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (delivery is null)
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Entrega nao encontrada.");

        return Ok(new
        {
            delivery.Id,
            delivery.VehicleId,
            VehiclePlate = delivery.Vehicle.Plate,
            delivery.Origin,
            delivery.Destination,
            delivery.Status,
            delivery.CreatedAt,
            delivery.DeliveredAt
        });
    }
}
