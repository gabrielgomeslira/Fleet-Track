CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate VARCHAR(10) NOT NULL,
    model VARCHAR(100) NOT NULL,
    driver_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'parado',
    latitude DOUBLE PRECISION NOT NULL DEFAULT -23.55,
    longitude DOUBLE PRECISION NOT NULL DEFAULT -46.63,
    speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    fuel_level INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    origin VARCHAR(200) NOT NULL,
    destination VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP
);

CREATE TABLE telemetry_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    fuel_level INT NOT NULL DEFAULT 100,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO vehicles (id, plate, model, driver_name, status, latitude, longitude, speed, fuel_level, updated_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'ABC-1234', 'Volvo FH 540', 'Carlos Silva', 'em_rota', -23.5505, -46.6333, 72.5, 68, NOW() - INTERVAL '10 minutes'),
('a1b2c3d4-0002-4000-8000-000000000002', 'DEF-5678', 'Scania R450', 'Maria Oliveira', 'em_rota', -22.9068, -43.1729, 85.0, 45, NOW() - INTERVAL '5 minutes'),
('a1b2c3d4-0003-4000-8000-000000000003', 'GHI-9012', 'Mercedes Actros', 'João Santos', 'parado', -25.4284, -49.2733, 0, 92, NOW() - INTERVAL '1 hour'),
('a1b2c3d4-0004-4000-8000-000000000004', 'JKL-3456', 'DAF XF', 'Ana Costa', 'em_rota', -19.9167, -43.9345, 63.2, 55, NOW() - INTERVAL '3 minutes'),
('a1b2c3d4-0005-4000-8000-000000000005', 'MNO-7890', 'Iveco Stralis', 'Pedro Lima', 'manutencao', -23.5505, -46.6333, 0, 30, NOW() - INTERVAL '2 hours'),
('a1b2c3d4-0006-4000-8000-000000000006', 'PQR-1122', 'Volvo VM 270', 'Fernanda Souza', 'em_rota', -21.1767, -47.8208, 91.0, 72, NOW() - INTERVAL '8 minutes'),
('a1b2c3d4-0007-4000-8000-000000000007', 'STU-3344', 'Scania P320', 'Ricardo Alves', 'parado', -30.0346, -51.2177, 0, 88, NOW() - INTERVAL '30 minutes'),
('a1b2c3d4-0008-4000-8000-000000000008', 'VWX-5566', 'Mercedes Atego', 'Juliana Rocha', 'em_rota', -15.7801, -47.9292, 55.8, 61, NOW() - INTERVAL '12 minutes'),
('a1b2c3d4-0009-4000-8000-000000000009', 'YZA-7788', 'MAN TGX', 'Lucas Ferreira', 'em_rota', -12.9714, -38.5124, 78.3, 39, NOW() - INTERVAL '2 minutes'),
('a1b2c3d4-0010-4000-8000-000000000010', 'BCD-9900', 'Ford Cargo', 'Camila Dias', 'parado', -3.7172, -38.5433, 0, 95, NOW() - INTERVAL '45 minutes');

INSERT INTO deliveries (vehicle_id, origin, destination, status, created_at, delivered_at) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'São Paulo, SP', 'Rio de Janeiro, RJ', 'em_transito', NOW() - INTERVAL '6 hours', NULL),
('a1b2c3d4-0001-4000-8000-000000000001', 'Campinas, SP', 'São Paulo, SP', 'entregue', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
('a1b2c3d4-0002-4000-8000-000000000002', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'em_transito', NOW() - INTERVAL '4 hours', NULL),
('a1b2c3d4-0002-4000-8000-000000000002', 'Niterói, RJ', 'Rio de Janeiro, RJ', 'entregue', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
('a1b2c3d4-0003-4000-8000-000000000003', 'Curitiba, PR', 'Florianópolis, SC', 'entregue', NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours'),
('a1b2c3d4-0003-4000-8000-000000000003', 'Londrina, PR', 'Curitiba, PR', 'pendente', NOW() - INTERVAL '1 hour', NULL),
('a1b2c3d4-0004-4000-8000-000000000004', 'Belo Horizonte, MG', 'Brasília, DF', 'em_transito', NOW() - INTERVAL '5 hours', NULL),
('a1b2c3d4-0004-4000-8000-000000000004', 'Uberlândia, MG', 'Belo Horizonte, MG', 'entregue', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
('a1b2c3d4-0005-4000-8000-000000000005', 'São Paulo, SP', 'Santos, SP', 'cancelado', NOW() - INTERVAL '2 days', NULL),
('a1b2c3d4-0006-4000-8000-000000000006', 'Ribeirão Preto, SP', 'São José do Rio Preto, SP', 'em_transito', NOW() - INTERVAL '3 hours', NULL),
('a1b2c3d4-0006-4000-8000-000000000006', 'Araraquara, SP', 'Ribeirão Preto, SP', 'entregue', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
('a1b2c3d4-0007-4000-8000-000000000007', 'Porto Alegre, RS', 'Caxias do Sul, RS', 'entregue', NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 hours'),
('a1b2c3d4-0007-4000-8000-000000000007', 'Pelotas, RS', 'Porto Alegre, RS', 'pendente', NOW() - INTERVAL '30 minutes', NULL),
('a1b2c3d4-0008-4000-8000-000000000008', 'Brasília, DF', 'Goiânia, GO', 'em_transito', NOW() - INTERVAL '2 hours', NULL),
('a1b2c3d4-0008-4000-8000-000000000008', 'Anápolis, GO', 'Brasília, DF', 'entregue', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
('a1b2c3d4-0009-4000-8000-000000000009', 'Salvador, BA', 'Recife, PE', 'em_transito', NOW() - INTERVAL '7 hours', NULL),
('a1b2c3d4-0009-4000-8000-000000000009', 'Aracaju, SE', 'Salvador, BA', 'entregue', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
('a1b2c3d4-0010-4000-8000-000000000010', 'Fortaleza, CE', 'Teresina, PI', 'pendente', NOW() - INTERVAL '2 hours', NULL),
('a1b2c3d4-0010-4000-8000-000000000010', 'São Luís, MA', 'Fortaleza, CE', 'entregue', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days'),
('a1b2c3d4-0001-4000-8000-000000000001', 'Sorocaba, SP', 'Campinas, SP', 'entregue', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
('a1b2c3d4-0003-4000-8000-000000000003', 'Maringá, PR', 'Londrina, PR', 'entregue', NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days'),
('a1b2c3d4-0004-4000-8000-000000000004', 'Juiz de Fora, MG', 'Uberlândia, MG', 'entregue', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'),
('a1b2c3d4-0006-4000-8000-000000000006', 'Bauru, SP', 'Araraquara, SP', 'entregue', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days'),
('a1b2c3d4-0009-4000-8000-000000000009', 'Maceió, AL', 'Aracaju, SE', 'entregue', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
('a1b2c3d4-0002-4000-8000-000000000002', 'Volta Redonda, RJ', 'Niterói, RJ', 'entregue', NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days'),
('a1b2c3d4-0005-4000-8000-000000000005', 'Guarulhos, SP', 'São Paulo, SP', 'entregue', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'),
('a1b2c3d4-0008-4000-8000-000000000008', 'Palmas, TO', 'Anápolis, GO', 'entregue', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days'),
('a1b2c3d4-0010-4000-8000-000000000010', 'Belém, PA', 'São Luís, MA', 'entregue', NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days'),
('a1b2c3d4-0007-4000-8000-000000000007', 'Santa Maria, RS', 'Pelotas, RS', 'entregue', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
('a1b2c3d4-0004-4000-8000-000000000004', 'Montes Claros, MG', 'Juiz de Fora, MG', 'entregue', NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days');

INSERT INTO telemetry_records (vehicle_id, latitude, longitude, speed, fuel_level, recorded_at)
SELECT
    v.id,
    v.latitude + (random() - 0.5) * 0.01 * gs,
    v.longitude + (random() - 0.5) * 0.01 * gs,
    CASE WHEN v.status = 'em_rota' THEN 40 + random() * 60 ELSE 0 END,
    GREATEST(10, v.fuel_level - gs),
    NOW() - (gs || ' minutes')::INTERVAL
FROM vehicles v
CROSS JOIN generate_series(1, 10) AS gs
WHERE v.status != 'manutencao';
