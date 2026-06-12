-- Tabla para copias restaurables completas del estado de la app.
-- Guarda puntos, documentacion, nomenclaturas globales y metadatos necesarios
-- para que "Recargar desde la nube" restaure lo mismo que el historial local.

CREATE TABLE IF NOT EXISTS app_state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('manual', 'automatico')),
    descripcion TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_state_snapshots_created_at
ON app_state_snapshots(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_state_snapshots_tipo
ON app_state_snapshots(tipo);

ALTER TABLE app_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_app_state_snapshots ON app_state_snapshots
FOR ALL USING (true) WITH CHECK (true);
