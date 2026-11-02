using FleetApi.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace FleetApi.Data;

public class AppDbContext : DbContext
{
    // Instantes continuam em "timestamp without time zone" até a T-14 migrá-los para timestamptz.
    private const string TipoInstante = "timestamp without time zone";

    // O Npgsql recusa DateTime com Kind=Utc em "timestamp without time zone". Os controladores
    // gravam DateTime.UtcNow, então a escrita descarta o Kind (o valor continua sendo UTC) e a
    // leitura segue devolvendo Unspecified, como hoje. Sai junto com a migração da T-14.
    private static readonly ValueConverter<DateTime, DateTime> InstanteSemFuso = new(
        escrita => DateTime.SpecifyKind(
            escrita.Kind == DateTimeKind.Local ? escrita.ToUniversalTime() : escrita, DateTimeKind.Unspecified),
        leitura => leitura);

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
            e.ToTable("vehicles");
            e.HasKey(v => v.Id);
            e.Property(v => v.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(v => v.Plate).HasColumnName("plate").HasMaxLength(10);
            e.Property(v => v.Model).HasColumnName("model").HasMaxLength(100);
            e.Property(v => v.DriverName).HasColumnName("driver_name").HasMaxLength(150);
            e.Property(v => v.Status).HasColumnName("status").HasMaxLength(20)
                .HasDefaultValueSql("'parado'").ValueGeneratedNever();
            e.Property(v => v.Latitude).HasColumnName("latitude")
                .HasDefaultValueSql("-23.55").ValueGeneratedNever();
            e.Property(v => v.Longitude).HasColumnName("longitude")
                .HasDefaultValueSql("-46.63").ValueGeneratedNever();
            e.Property(v => v.Speed).HasColumnName("speed")
                .HasDefaultValueSql("0").ValueGeneratedNever();
            e.Property(v => v.FuelLevel).HasColumnName("fuel_level")
                .HasDefaultValueSql("100").ValueGeneratedNever();
            e.Property(v => v.UpdatedAt).HasColumnName("updated_at").HasColumnType(TipoInstante).HasConversion(InstanteSemFuso)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
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
            e.Property(d => d.CreatedAt).HasColumnName("created_at").HasColumnType(TipoInstante).HasConversion(InstanteSemFuso)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
            e.Property(d => d.DeliveredAt).HasColumnName("delivered_at").HasColumnType(TipoInstante).HasConversion(InstanteSemFuso);
            e.HasOne(d => d.Vehicle).WithMany(v => v.Deliveries).HasForeignKey(d => d.VehicleId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<TelemetryRecord>(e =>
        {
            e.ToTable("telemetry_records");
            e.HasKey(t => t.Id);
            e.Property(t => t.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(t => t.VehicleId).HasColumnName("vehicle_id");
            e.Property(t => t.Latitude).HasColumnName("latitude");
            e.Property(t => t.Longitude).HasColumnName("longitude");
            e.Property(t => t.Speed).HasColumnName("speed")
                .HasDefaultValueSql("0").ValueGeneratedNever();
            e.Property(t => t.FuelLevel).HasColumnName("fuel_level")
                .HasDefaultValueSql("100").ValueGeneratedNever();
            e.Property(t => t.RecordedAt).HasColumnName("recorded_at").HasColumnType(TipoInstante).HasConversion(InstanteSemFuso)
                .HasDefaultValueSql("NOW()").ValueGeneratedNever();
            e.HasOne(t => t.Vehicle).WithMany(v => v.TelemetryRecords).HasForeignKey(t => t.VehicleId)
                .OnDelete(DeleteBehavior.NoAction);
        });
    }
}
