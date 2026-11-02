using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetApi.Migrations
{
    /// <inheritdoc />
    public partial class Baseline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pgcrypto", ",,");

            migrationBuilder.CreateTable(
                name: "vehicles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    plate = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    driver_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValueSql: "'parado'"),
                    latitude = table.Column<double>(type: "double precision", nullable: false, defaultValueSql: "-23.55"),
                    longitude = table.Column<double>(type: "double precision", nullable: false, defaultValueSql: "-46.63"),
                    speed = table.Column<double>(type: "double precision", nullable: false, defaultValueSql: "0"),
                    fuel_level = table.Column<int>(type: "integer", nullable: false, defaultValueSql: "100"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vehicles", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "deliveries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    vehicle_id = table.Column<Guid>(type: "uuid", nullable: false),
                    origin = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    destination = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValueSql: "'pendente'"),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "NOW()"),
                    delivered_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deliveries", x => x.id);
                    table.ForeignKey(
                        name: "FK_deliveries_vehicles_vehicle_id",
                        column: x => x.vehicle_id,
                        principalTable: "vehicles",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "telemetry_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    vehicle_id = table.Column<Guid>(type: "uuid", nullable: false),
                    latitude = table.Column<double>(type: "double precision", nullable: false),
                    longitude = table.Column<double>(type: "double precision", nullable: false),
                    speed = table.Column<double>(type: "double precision", nullable: false, defaultValueSql: "0"),
                    fuel_level = table.Column<int>(type: "integer", nullable: false, defaultValueSql: "100"),
                    recorded_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_telemetry_records", x => x.id);
                    table.ForeignKey(
                        name: "FK_telemetry_records_vehicles_vehicle_id",
                        column: x => x.vehicle_id,
                        principalTable: "vehicles",
                        principalColumn: "id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_deliveries_vehicle_id",
                table: "deliveries",
                column: "vehicle_id");

            migrationBuilder.CreateIndex(
                name: "IX_telemetry_records_vehicle_id",
                table: "telemetry_records",
                column: "vehicle_id");
        }

        /// <summary>
        /// Derruba tudo: apaga as três tabelas e os dados delas. A baseline não tem versão anterior
        /// para a qual voltar; o Down existe só para recomeçar do zero em desenvolvimento e teste.
        /// A extensão pgcrypto fica, porque pode ter outros usos no banco.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deliveries");

            migrationBuilder.DropTable(
                name: "telemetry_records");

            migrationBuilder.DropTable(
                name: "vehicles");
        }
    }
}
