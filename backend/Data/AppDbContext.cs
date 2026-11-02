using FleetApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Data;

public class AppDbContext : DbContext
{
    private const string TipoInstante = "timestamp with time zone";

    // Instantes são "timestamp with time zone" (UTC). O Npgsql grava DateTime só com Kind=Utc e
    // devolve Kind=Utc na leitura, então a API serializa com "Z" (ADR-0009).
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<TelemetryRecord> TelemetryRecords => Set<TelemetryRecord>();

    // Os valores padrão abaixo existem só no esquema (baseline = antigo db/init.sql). Com
    // ValueGeneratedNever o EF sempre envia o valor da entidade: sem isso, um 0 gravado de
    // propósito seria trocado pelo padrão do banco.
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("pgcrypto");

        modelBuilder.Entity<Vehicle>(e =>
        {
            e.ToTable("vehicles", t =>
            {
                // Latitude e longitude andam juntas, e quem tem posição tem sinal (ADR-0017).
                t.HasCheckConstraint("ck_vehicles_posicao_completa", "(latitude IS NULL) = (longitude IS NULL)");
                t.HasCheckConstraint("ck_vehicles_posicao_com_sinal", "latitude IS NULL OR last_signal_at IS NOT NULL");
            });
            e.HasKey(v => v.Id);
            e.Property(v => v.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(v => v.Plate).HasColumnName("plate").HasMaxLength(10);
            e.Property(v => v.Model).HasColumnName("model").HasMaxLength(100);
            e.Property(v => v.DriverName).HasColumnName("driver_name").HasMaxLength(150);
            e.Property(v => v.Status).HasColumnName("status").HasMaxLength(20)
                .HasDefaultValueSql("'parado'").ValueGeneratedNever();
            // Posição, velocidade e combustível são anuláveis e sem valor padrão (ADR-0017): nulo é
            // "sem dado", e um padrão inventaria um veículo em São Paulo a 0 km/h com tanque cheio.
            e.Property(v => v.Latitude).HasColumnName("latitude");
            e.Property(v => v.Longitude).HasColumnName("longitude");
            e.Property(v => v.Speed).HasColumnName("speed");
            e.Property(v => v.FuelLevel).HasColumnName("fuel_level");
            e.Property(v => v.UpdatedAt).HasColumnName("updated_at").HasColumnType(TipoInstante)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
            e.Property(v => v.LastSignalAt).HasColumnName("last_signal_at").HasColumnType(TipoInstante);
            e.HasIndex(v => new { v.Plate, v.Id });
        });

        modelBuilder.Entity<Delivery>(e =>
        {
            e.ToTable("deliveries");
            e.HasKey(d => d.Id);
            e.Property(d => d.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(d => d.VehicleId).HasColumnName("vehicle_id");
            e.Property(d => d.Origin).HasColumnName("origin").HasMaxLength(200);
            e.Property(d => d.Destination).HasColumnName("destination").HasMaxLength(200);
            e.Property(d => d.Status).HasColumnName("status").HasMaxLength(20)
                .HasDefaultValueSql("'pendente'").ValueGeneratedNever();
            e.Property(d => d.CreatedAt).HasColumnName("created_at").HasColumnType(TipoInstante)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
            e.Property(d => d.DeliveredAt).HasColumnName("delivered_at").HasColumnType(TipoInstante);
            e.Property(d => d.RoutePath).HasColumnName("route_path").HasColumnType("jsonb");
            e.HasOne(d => d.Vehicle).WithMany(v => v.Deliveries).HasForeignKey(d => d.VehicleId)
                .OnDelete(DeleteBehavior.NoAction);
            // Listagem paginada por cursor (created_at DESC, id DESC), com e sem filtro de status.
            // O índice por vehicle_id vem da chave estrangeira.
            e.HasIndex(d => new { d.CreatedAt, d.Id }).IsDescending(true, true);
            e.HasIndex(d => new { d.Status, d.CreatedAt }).IsDescending(false, true);
        });

        modelBuilder.Entity<TelemetryRecord>(e =>
        {
            e.ToTable("telemetry_records");
            e.HasKey(t => t.Id);
            e.Property(t => t.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(t => t.VehicleId).HasColumnName("vehicle_id");
            e.Property(t => t.Latitude).HasColumnName("latitude");
            e.Property(t => t.Longitude).HasColumnName("longitude");
            e.Property(t => t.Speed).HasColumnName("speed");
            e.Property(t => t.FuelLevel).HasColumnName("fuel_level");
            e.Property(t => t.RecordedAt).HasColumnName("recorded_at").HasColumnType(TipoInstante)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
            e.HasOne(t => t.Vehicle).WithMany(v => v.TelemetryRecords).HasForeignKey(t => t.VehicleId)
                .OnDelete(DeleteBehavior.NoAction);
            // Garantia de banco contra instante repetido do mesmo veículo (H-27) e índice da
            // consulta "últimos registros do veículo". Cobre o prefixo vehicle_id da chave estrangeira.
            e.HasIndex(t => new { t.VehicleId, t.RecordedAt }).IsUnique().IsDescending(false, true);
        });
    }
}
