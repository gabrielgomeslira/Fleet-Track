using FleetApi.Demo;
using FleetApi.Jobs;
using FleetApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Data;

/// <summary>
/// Dados de demonstração (antes em db/init.sql). Só roda no modo demo (<c>FLEET_DEMO_MODE=true</c>,
/// padrão desligado; ADR-0007) e, mesmo nele, só grava se <c>vehicles</c> estiver vazia, tudo ou nada
/// numa transação. Nomes e placas são fictícios (H-14): motoristas são combinações comuns de nome e
/// sobrenome sem relação com pessoa real, e as placas são trincas de letras consecutivas do alfabeto
/// com dígitos em sequência, que não identificam veículo algum.
/// </summary>
public static class SeedDemonstracao
{
    /// <summary>Mesma chave do job de simulação: o seed e o job são ligados juntos pelo modo demo.</summary>
    public const string ChaveConfiguracao = SimulacaoJob.ChaveConfiguracao;

    // Impede que duas instâncias subindo juntas semeiem ao mesmo tempo.
    private const long ChaveLock = 0x464C454554534544; // "FLEETSED"

    private static Guid IdVeiculo(int n) => Guid.Parse($"a1b2c3d4-{n:D4}-4000-8000-{n:D12}");

    /// <summary>Ausente ou diferente de "true" = desligado, como no <see cref="SimulacaoJob"/>.</summary>
    public static bool Habilitado(IConfiguration configuracao) => SimulacaoJob.Habilitado(configuracao);

    /// <returns>true se semeou; false se a tabela já tinha veículos.</returns>
    public static async Task<bool> ExecutarAsync(AppDbContext db, CancellationToken ct = default)
    {
        // A estratégia de retry do EF exige que a transação do usuário rode dentro dela.
        var estrategia = db.Database.CreateExecutionStrategy();
        return await estrategia.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transacao = await db.Database.BeginTransactionAsync(ct);

            await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({ChaveLock})", ct);

            if (await db.Vehicles.AnyAsync(ct))
            {
                return false;
            }

            var agora = DateTime.UtcNow;
            db.Vehicles.AddRange(Veiculos(agora));
            db.Deliveries.AddRange(Entregas(agora));
            await db.SaveChangesAsync(ct);

            // A telemetria deriva dos veículos já gravados, como no SQL original.
            db.TelemetryRecords.AddRange(Telemetria(db.Vehicles.Local.ToList(), agora, new Random()));
            await db.SaveChangesAsync(ct);

            await transacao.CommitAsync(ct);
            return true;
        });
    }

    private static Vehicle[] Veiculos(DateTime agora)
    {
        Vehicle V(int n, string placa, string modelo, string motorista, string status,
            double lat, double lon, double vel, int combustivel, TimeSpan atras) => new()
        {
            Id = IdVeiculo(n), Plate = placa, Model = modelo, DriverName = motorista, Status = status,
            Latitude = lat, Longitude = lon, Speed = vel, FuelLevel = combustivel, UpdatedAt = agora - atras,
            LastSignalAt = agora - atras,
        };

        return
        [
            V(1, "ABC-1234", "Volvo FH 540", "Carlos Silva", "em_rota", -23.5505, -46.6333, 72.5, 68, TimeSpan.FromMinutes(10)),
            V(2, "DEF-5678", "Scania R450", "Maria Oliveira", "em_rota", -22.9068, -43.1729, 85.0, 45, TimeSpan.FromMinutes(5)),
            V(3, "GHI-9012", "Mercedes Actros", "João Santos", "parado", -25.4284, -49.2733, 0, 92, TimeSpan.FromHours(1)),
            V(4, "JKL-3456", "DAF XF", "Ana Costa", "em_rota", -19.9167, -43.9345, 63.2, 55, TimeSpan.FromMinutes(3)),
            V(5, "MNO-7890", "Iveco Stralis", "Pedro Lima", "manutencao", -23.5505, -46.6333, 0, 30, TimeSpan.FromHours(2)),
            V(6, "PQR-1122", "Volvo VM 270", "Fernanda Souza", "em_rota", -21.1775, -47.8103, 91.0, 72, TimeSpan.FromMinutes(8)),
            V(7, "STU-3344", "Scania P320", "Ricardo Alves", "parado", -30.0346, -51.2177, 0, 88, TimeSpan.FromMinutes(30)),
            V(8, "VWX-5566", "Mercedes Atego", "Juliana Rocha", "em_rota", -15.7801, -47.9292, 55.8, 61, TimeSpan.FromMinutes(12)),
            V(9, "YZA-7788", "MAN TGX", "Lucas Ferreira", "em_rota", -12.9714, -38.5014, 78.3, 39, TimeSpan.FromMinutes(2)),
            V(10, "BCD-9900", "Ford Cargo", "Camila Dias", "parado", -3.7172, -38.5433, 0, 95, TimeSpan.FromMinutes(45)),
        ];
    }

    private static Delivery[] Entregas(DateTime agora)
    {
        // criada = há quanto tempo foi criada; entregue = há quanto tempo foi entregue (null = não entregue).
        Delivery E(int veiculo, string origem, string destino, string status, TimeSpan criada, TimeSpan? entregue = null) => new()
        {
            VehicleId = IdVeiculo(veiculo), Origin = origem, Destination = destino, Status = status,
            CreatedAt = agora - criada, DeliveredAt = entregue is { } t ? agora - t : null,
            // Só a entrega em andamento tem trajeto; as demais ficam nulas (ADR-0016 item 12).
            RoutePath = status == "em_transito" ? Corredores.Obter(origem, destino).GeoJson : null,
        };

        static TimeSpan H(double h) => TimeSpan.FromHours(h);
        static TimeSpan D(double d) => TimeSpan.FromDays(d);
        static TimeSpan M(double m) => TimeSpan.FromMinutes(m);

        return
        [
            E(1, "São Paulo, SP", "Rio de Janeiro, RJ", "em_transito", H(6)),
            E(1, "Campinas, SP", "São Paulo, SP", "entregue", D(2), D(1)),
            E(2, "Rio de Janeiro, RJ", "Belo Horizonte, MG", "em_transito", H(4)),
            E(2, "Niterói, RJ", "Rio de Janeiro, RJ", "entregue", D(3), D(2)),
            E(3, "Curitiba, PR", "Florianópolis, SC", "entregue", D(1), H(12)),
            E(3, "Londrina, PR", "Curitiba, PR", "pendente", H(1)),
            E(4, "Belo Horizonte, MG", "Brasília, DF", "em_transito", H(5)),
            E(4, "Uberlândia, MG", "Belo Horizonte, MG", "entregue", D(4), D(3)),
            E(5, "São Paulo, SP", "Santos, SP", "cancelado", D(2)),
            E(6, "Ribeirão Preto, SP", "São José do Rio Preto, SP", "em_transito", H(3)),
            E(6, "Araraquara, SP", "Ribeirão Preto, SP", "entregue", D(5), D(4)),
            E(7, "Porto Alegre, RS", "Caxias do Sul, RS", "entregue", D(1), H(18)),
            E(7, "Pelotas, RS", "Porto Alegre, RS", "pendente", M(30)),
            E(8, "Brasília, DF", "Goiânia, GO", "em_transito", H(2)),
            E(8, "Anápolis, GO", "Brasília, DF", "entregue", D(6), D(5)),
            E(9, "Salvador, BA", "Recife, PE", "em_transito", H(7)),
            E(9, "Aracaju, SE", "Salvador, BA", "entregue", D(3), D(2)),
            E(10, "Fortaleza, CE", "Teresina, PI", "pendente", H(2)),
            E(10, "São Luís, MA", "Fortaleza, CE", "entregue", D(7), D(6)),
            E(1, "Sorocaba, SP", "Campinas, SP", "entregue", D(5), D(4)),
            E(3, "Maringá, PR", "Londrina, PR", "entregue", D(8), D(7)),
            E(4, "Juiz de Fora, MG", "Uberlândia, MG", "entregue", D(10), D(9)),
            E(6, "Bauru, SP", "Araraquara, SP", "entregue", D(9), D(8)),
            E(9, "Maceió, AL", "Aracaju, SE", "entregue", D(6), D(5)),
            E(2, "Volta Redonda, RJ", "Niterói, RJ", "entregue", D(8), D(7)),
            E(5, "Guarulhos, SP", "São Paulo, SP", "entregue", D(10), D(9)),
            E(8, "Palmas, TO", "Anápolis, GO", "entregue", D(12), D(11)),
            E(10, "Belém, PA", "São Luís, MA", "entregue", D(14), D(13)),
            E(7, "Santa Maria, RS", "Pelotas, RS", "entregue", D(5), D(4)),
            E(4, "Montes Claros, MG", "Juiz de Fora, MG", "entregue", D(15), D(14)),
        ];
    }

    /// <summary>10 pontos por veículo (exceto em manutenção), 1 a 10 minutos atrás, com ruído no GPS.</summary>
    private static IEnumerable<TelemetryRecord> Telemetria(IEnumerable<Vehicle> veiculos, DateTime agora, Random aleatorio)
    {
        foreach (var v in veiculos.Where(v => v.Status != "manutencao").OrderBy(v => v.Id))
        {
            for (var gs = 1; gs <= 10; gs++)
            {
                yield return new TelemetryRecord
                {
                    VehicleId = v.Id,
                    Latitude = v.Latitude!.Value + (aleatorio.NextDouble() - 0.5) * 0.01 * gs,
                    Longitude = v.Longitude!.Value + (aleatorio.NextDouble() - 0.5) * 0.01 * gs,
                    Speed = v.Status == "em_rota" ? 40 + aleatorio.NextDouble() * 60 : 0,
                    FuelLevel = Math.Max(10, v.FuelLevel!.Value - gs),
                    RecordedAt = agora - TimeSpan.FromMinutes(gs),
                };
            }
        }
    }
}
