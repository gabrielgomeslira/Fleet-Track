namespace FleetApi.Demo;

/// <summary>Estado de um veículo que o motor da demo lê e devolve.</summary>
public readonly record struct EstadoVeiculo(double Latitude, double Longitude, double VelocidadeKmH, int Combustivel);

/// <summary>
/// Regra de movimento da frota na demo: função pura, sem banco, sem relógio e sem sorteio. Nesta
/// versão a velocidade é constante e o combustível não muda; o perfil de velocidade (T-96) e o
/// consumo (T-97) entram depois, sem mudar a assinatura.
/// </summary>
public static class MotorDemo
{
    public const double VelocidadeConstanteKmH = 60;

    /// <summary>
    /// Novo estado depois de <paramref name="dt"/>. Sem rota (<paramref name="rota"/> nulo) o veículo
    /// fica parado: velocidade 0 e posição igual. Com rota, a posição atual é projetada na linha e
    /// avança <c>velocidade × dt</c> por ela. Ao alcançar o fim, fica no último ponto com velocidade 0.
    /// </summary>
    public static EstadoVeiculo Avancar(EstadoVeiculo estado, GeoRota? rota, TimeSpan dt)
    {
        if (rota is null || dt <= TimeSpan.Zero)
        {
            return estado with { VelocidadeKmH = 0 };
        }

        var atual = rota.Projetar(new Ponto(estado.Longitude, estado.Latitude));
        var alvo = atual + VelocidadeConstanteKmH / 3.6 * dt.TotalSeconds;

        if (alvo >= rota.ComprimentoEmMetros)
        {
            var fim = rota.Fim;
            return estado with { Latitude = fim.Latitude, Longitude = fim.Longitude, VelocidadeKmH = 0 };
        }

        var destino = rota.Interpolar(alvo);
        return estado with
        {
            Latitude = destino.Latitude,
            Longitude = destino.Longitude,
            VelocidadeKmH = VelocidadeConstanteKmH,
        };
    }
}
