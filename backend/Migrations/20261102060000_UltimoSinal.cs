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
            // Só de expansão (ADR-0017): soltar NOT NULL, tirar valor padrão e somar uma coluna anulável
            // só mexem no catálogo, sem reescrever a tabela. Os valores já gravados não são tocados.
            migrationBuilder.AddColumn<DateTime>(
                name: "last_signal_at",
                table: "vehicles",
                type: "timestamp with time zone",
                nullable: true);

            // O último sinal de quem já existe é o registro mais recente da telemetria; sem registro (ou
            // com a telemetria já apagada), a última atualização da linha. Tem de rodar antes do CHECK
            // "quem tem posição tem sinal".
            migrationBuilder.Sql("""
                UPDATE vehicles v SET last_signal_at = COALESCE(
                    (SELECT max(t.recorded_at) FROM telemetry_records t WHERE t.vehicle_id = v.id),
                    v.updated_at)
                """);

            migrationBuilder.AlterColumn<double>(
                name: "longitude",
                table: "vehicles",
                type: "double precision",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "-46.63");

            migrationBuilder.AlterColumn<double>(
                name: "latitude",
                table: "vehicles",
                type: "double precision",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "-23.55");

            migrationBuilder.AlterColumn<double>(
                name: "speed",
                table: "vehicles",
                type: "double precision",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "0");

            migrationBuilder.AlterColumn<int>(
                name: "fuel_level",
                table: "vehicles",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValueSql: "100");

            // Na telemetria só velocidade e combustível passam a aceitar nulo: um registro sem posição
            // não é posição.
            migrationBuilder.AlterColumn<double>(
                name: "speed",
                table: "telemetry_records",
                type: "double precision",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "double precision",
                oldDefaultValueSql: "0");

            migrationBuilder.AlterColumn<int>(
                name: "fuel_level",
                table: "telemetry_records",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValueSql: "100");

            migrationBuilder.AddCheckConstraint(
                name: "ck_vehicles_posicao_completa",
                table: "vehicles",
                sql: "(latitude IS NULL) = (longitude IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_vehicles_posicao_com_sinal",
                table: "vehicles",
                sql: "latitude IS NULL OR last_signal_at IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // COM PERDA, só como recuperação (ADR-0017): para a coluna voltar a ser NOT NULL, quem está
            // com nulo recebe os valores padrão antigos. O dado original foi apagado pelo expurgo e não
            // volta: veículo com posição expirada reaparece "em São Paulo", e leitura ausente vira
            // 0 km/h e 100% de combustível. Registrar no PR de quem reverter.
            migrationBuilder.DropCheckConstraint(
                name: "ck_vehicles_posicao_com_sinal",
                table: "vehicles");

            migrationBuilder.DropCheckConstraint(
                name: "ck_vehicles_posicao_completa",
                table: "vehicles");

            // A posição do registro mais recente, se ainda existir; senão, o padrão do esquema.
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

            migrationBuilder.Sql("UPDATE vehicles SET speed = COALESCE(speed, 0), fuel_level = COALESCE(fuel_level, 100) WHERE speed IS NULL OR fuel_level IS NULL");
            migrationBuilder.Sql("UPDATE telemetry_records SET speed = COALESCE(speed, 0), fuel_level = COALESCE(fuel_level, 100) WHERE speed IS NULL OR fuel_level IS NULL");

            migrationBuilder.DropColumn(
                name: "last_signal_at",
                table: "vehicles");

            migrationBuilder.AlterColumn<int>(
                name: "fuel_level",
                table: "telemetry_records",
                type: "integer",
                nullable: false,
                defaultValueSql: "100",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "speed",
                table: "telemetry_records",
                type: "double precision",
                nullable: false,
                defaultValueSql: "0",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "fuel_level",
                table: "vehicles",
                type: "integer",
                nullable: false,
                defaultValueSql: "100",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "speed",
                table: "vehicles",
                type: "double precision",
                nullable: false,
                defaultValueSql: "0",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "latitude",
                table: "vehicles",
                type: "double precision",
                nullable: false,
                defaultValueSql: "-23.55",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "longitude",
                table: "vehicles",
                type: "double precision",
                nullable: false,
                defaultValueSql: "-46.63",
                oldClrType: typeof(double),
                oldType: "double precision",
                oldNullable: true);
        }
    }
}
