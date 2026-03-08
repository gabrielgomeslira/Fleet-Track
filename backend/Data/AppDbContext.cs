using FleetApi.Models;
using Microsoft.EntityFrameworkCore;

namespace FleetApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<TelemetryRecord> TelemetryRecords => Set<TelemetryRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vehicle>(e =>
        {
            e.ToTable("vehicles");
            e.HasKey(v => v.Id);
            e.Property(v => v.Id).HasColumnName("id");
            e.Property(v => v.Plate).HasColumnName("plate");
            e.Property(v => v.Model).HasColumnName("model");
            e.Property(v => v.DriverName).HasColumnName("driver_name");
            e.Property(v => v.Status).HasColumnName("status");
            e.Property(v => v.Latitude).HasColumnName("latitude");
            e.Property(v => v.Longitude).HasColumnName("longitude");
            e.Property(v => v.Speed).HasColumnName("speed");
            e.Property(v => v.FuelLevel).HasColumnName("fuel_level");
            e.Property(v => v.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Delivery>(e =>
        {
            e.ToTable("deliveries");
            e.HasKey(d => d.Id);
            e.Property(d => d.Id).HasColumnName("id");
            e.Property(d => d.VehicleId).HasColumnName("vehicle_id");
            e.Property(d => d.Origin).HasColumnName("origin");
            e.Property(d => d.Destination).HasColumnName("destination");
            e.Property(d => d.Status).HasColumnName("status");
            e.Property(d => d.CreatedAt).HasColumnName("created_at");
            e.Property(d => d.DeliveredAt).HasColumnName("delivered_at");
            e.HasOne(d => d.Vehicle).WithMany(v => v.Deliveries).HasForeignKey(d => d.VehicleId);
        });

        modelBuilder.Entity<TelemetryRecord>(e =>
        {
            e.ToTable("telemetry_records");
            e.HasKey(t => t.Id);
            e.Property(t => t.Id).HasColumnName("id");
            e.Property(t => t.VehicleId).HasColumnName("vehicle_id");
            e.Property(t => t.Latitude).HasColumnName("latitude");
            e.Property(t => t.Longitude).HasColumnName("longitude");
            e.Property(t => t.Speed).HasColumnName("speed");
            e.Property(t => t.FuelLevel).HasColumnName("fuel_level");
            e.Property(t => t.RecordedAt).HasColumnName("recorded_at");
            e.HasOne(t => t.Vehicle).WithMany(v => v.TelemetryRecords).HasForeignKey(t => t.VehicleId);
        });
    }
}
