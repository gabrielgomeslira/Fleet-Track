using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetApi.Migrations
{
    /// <inheritdoc />
    public partial class RotaDaEntrega : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Só de expansão (ADR-0016 item 12): coluna anulável e sem valor padrão, então o Postgres
            // só altera o catálogo, sem reescrever a tabela nem tomar lock longo. Linhas existentes
            // ficam com NULL, que é o valor correto fora da demo.
            migrationBuilder.AddColumn<string>(
                name: "route_path",
                table: "deliveries",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Descarta os trajetos gravados: a coluna é a única cópia deles no banco.
            migrationBuilder.DropColumn(
                name: "route_path",
                table: "deliveries");
        }
    }
}
