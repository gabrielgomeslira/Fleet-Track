using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetApi.Migrations
{
    /// <inheritdoc />
    public partial class TimestamptzEIndices : Migration
    {
        // Colunas de instante: tabela, coluna. Os valores gravados até aqui são UTC (o código sempre
        // gravou DateTime.UtcNow), então a conversão declara UTC de forma explícita. Sem USING, o
        // Postgres usaria o fuso da sessão, que muda o instante conforme o servidor.
        private static readonly (string Tabela, string Coluna)[] Instantes =
        [
            ("vehicles", "updated_at"),
            ("deliveries", "created_at"),
            ("deliveries", "delivered_at"),
            ("telemetry_records", "recorded_at"),
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // O índice único falha se já houver dois registros do mesmo veículo no mesmo instante.
            // Instalações anteriores à v1.0 são recriadas (P3), então não há limpeza aqui.
            migrationBuilder.DropIndex(
                name: "IX_telemetry_records_vehicle_id",
                table: "telemetry_records");

            foreach (var (tabela, coluna) in Instantes)
            {
                migrationBuilder.Sql(
                    $"ALTER TABLE {tabela} ALTER COLUMN {coluna} TYPE timestamp with time zone USING {coluna} AT TIME ZONE 'UTC';");
            }

            migrationBuilder.CreateIndex(
                name: "IX_vehicles_plate_id",
                table: "vehicles",
                columns: new[] { "plate", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_deliveries_created_at_id",
                table: "deliveries",
                columns: new[] { "created_at", "id" },
                descending: new[] { true, true });

            migrationBuilder.CreateIndex(
                name: "IX_deliveries_status_created_at",
                table: "deliveries",
                columns: new[] { "status", "created_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_telemetry_records_vehicle_id_recorded_at",
                table: "telemetry_records",
                columns: new[] { "vehicle_id", "recorded_at" },
                unique: true,
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_telemetry_records_vehicle_id_recorded_at",
                table: "telemetry_records");

            migrationBuilder.DropIndex(
                name: "IX_deliveries_status_created_at",
                table: "deliveries");

            migrationBuilder.DropIndex(
                name: "IX_deliveries_created_at_id",
                table: "deliveries");

            migrationBuilder.DropIndex(
                name: "IX_vehicles_plate_id",
                table: "vehicles");

            foreach (var (tabela, coluna) in Instantes)
            {
                migrationBuilder.Sql(
                    $"ALTER TABLE {tabela} ALTER COLUMN {coluna} TYPE timestamp without time zone USING {coluna} AT TIME ZONE 'UTC';");
            }

            migrationBuilder.CreateIndex(
                name: "IX_telemetry_records_vehicle_id",
                table: "telemetry_records",
                column: "vehicle_id");
        }
    }
}
