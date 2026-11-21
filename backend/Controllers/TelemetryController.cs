using FleetApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TelemetryController : ControllerBase
{
    /// <summary>Janela padrão do trajeto quando <c>from</c> e <c>to</c> não vêm: as últimas 24 h.</summary>
    public static readonly TimeSpan JanelaPadrao = TimeSpan.FromHours(24);

    /// <summary>Maior janela aceita num pedido de trajeto. Acima disso, 400.</summary>
    public static readonly TimeSpan JanelaMaxima = TimeSpan.FromDays(7);

    /// <summary>Teto de pontos por resposta. Um dia a cada 30 s são 2.880; acima do teto a resposta avisa o corte.</summary>
    public const int TetoDePontos = 5_000;

    private readonly AppDbContext _db;
    private readonly TimeProvider _relogio;

    public TelemetryController(AppDbContext db, TimeProvider relogio)
    {
        _db = db;
        _relogio = relogio;
    }

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

    /// <summary>
    /// Trajeto de um veículo num período, do ponto mais antigo ao mais novo, para o gestor rever o caminho
    /// feito. <c>from</c> e <c>to</c> são instantes ISO 8601 com fuso; sem eles, as últimas 24 h. O intervalo
    /// é fechado em <c>from</c> e aberto em <c>to</c>. Acima de <see cref="TetoDePontos"/>, devolve os
    /// primeiros e marca <c>truncated</c>: nunca corta em silêncio.
    /// </summary>
    [HttpGet("{vehicleId:guid}/route")]
    public async Task<IActionResult> GetRoute(Guid vehicleId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to)
    {
        var fim = (to ?? _relogio.GetUtcNow()).UtcDateTime;
        var inicio = (from ?? new DateTimeOffset(fim) - JanelaPadrao).UtcDateTime;

        if (fim <= inicio)
        {
            ModelState.AddModelError(nameof(to), "'to' deve ser posterior a 'from'.");
            return ValidationProblem(ModelState);
        }

        if (fim - inicio > JanelaMaxima)
        {
            ModelState.AddModelError(nameof(from), $"O periodo maximo e de {JanelaMaxima.TotalDays:0} dias.");
            return ValidationProblem(ModelState);
        }

        if (!await _db.Vehicles.AnyAsync(v => v.Id == vehicleId))
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Veiculo nao encontrado.");

        var pontos = await _db.TelemetryRecords
            .Where(t => t.VehicleId == vehicleId && t.RecordedAt >= inicio && t.RecordedAt < fim)
            .OrderBy(t => t.RecordedAt)
            .Take(TetoDePontos + 1)
            .Select(t => new
            {
                t.Latitude,
                t.Longitude,
                t.Speed,
                t.FuelLevel,
                t.RecordedAt
            })
            .ToListAsync();

        var cortado = pontos.Count > TetoDePontos;
        if (cortado)
            pontos.RemoveAt(pontos.Count - 1);

        return Ok(new
        {
            From = inicio,
            To = fim,
            Truncated = cortado,
            Points = pontos
        });
    }
}
