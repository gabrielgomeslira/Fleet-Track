using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetApi.Migrations
{
    /// <inheritdoc />
    public partial class UltimoSinal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Só de expansão (H-12): soltar o NOT NULL e somar uma coluna anulável sem valor padrão só
            // mexem no catálogo, sem reescrever a tabela. O valor padrão do esquema fica como está.
            migrationBuilder.AlterColumn<double>(
                name: "longitude",
                table: "vehicles",
                type: "double precision",
                nullable: true,
                defaultValueSql: "-46.63",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "-46.63");

            migrationBuilder.AlterColumn<double>(
                name: "latitude",
                table: "vehicles",
                type: "double precision",
                nullable: true,
                defaultValueSql: "-23.55",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "-23.55");

            migrationBuilder.AddColumn<DateTime>(
                name: "last_signal_at",
                table: "vehicles",
                type: "timestamp with time zone",
                nullable: true);

            // O último sinal conhecido de quem já existe é a última atualização da linha.
            migrationBuilder.Sql("UPDATE vehicles SET last_signal_at = updated_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Quem teve a posição expirada precisa de um valor antes de a coluna voltar a ser NOT NULL:
            // a posição do registro mais recente, se ainda existir, ou o padrão do esquema (São Paulo).
            // É inventada de propósito: o dado original foi apagado pelo expurgo e não volta.
            migrationBuilder.Sql("""
                UPDATE vehicles v SET
                    latitude = COALESCE(v.latitude,
                        (SELECT t.latitude FROM telemetry_records t WHERE t.vehicle_id = v.id
                         ORDER BY t.recorded_at DESC LIMIT 1), -23.55),
                    longitude = COALESCE(v.longitude,
                        (SELECT t.longitude FROM telemetry_records t WHERE t.vehicle_id = v.id
                         ORDER BY t.recorded_at DESC LIMIT 1), -46.63)
                WHERE v.latitude IS NULL OR v.longitude IS NULL
                """);

            migrationBuilder.DropColumn(
                name: "last_signal_at",
                table: "vehicles");

            migrationBuilder.AlterColumn<double>(
                name: "longitude",
                table: "vehicles",
                type: "double precision",
                nullable: false,
                defaultValueSql: "-46.63",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true,
                oldDefaultValueSql: "-46.63");

            migrationBuilder.AlterColumn<double>(
                name: "latitude",
                table: "vehicles",
                type: "double precision",
                nullable: false,
                defaultValueSql: "-23.55",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true,
                oldDefaultValueSql: "-23.55");
        }
    }
}
