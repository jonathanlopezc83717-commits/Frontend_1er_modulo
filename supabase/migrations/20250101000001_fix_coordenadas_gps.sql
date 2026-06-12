-- ========================================================
-- FIX: Actualizar tabla coordenadas_gps existente
-- Fecha: 2025-01-01
-- 
-- Esta migración actualiza la tabla coordenadas_gps existente
-- para agregar la columna punto_id y hacerla compatible
-- ========================================================

-- =====================================================
-- 1. AGREGAR COLUMNA punto_id A coordenadas_gps
-- =====================================================

-- Primero, verificar si la columna existe
DO $$
BEGIN
    -- Agregar columna punto_id si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'coordenadas_gps' 
        AND column_name = 'punto_id'
    ) THEN
        ALTER TABLE coordenadas_gps ADD COLUMN punto_id UUID REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE;
        
        -- Crear índice
        CREATE INDEX idx_coordenadas_punto_id ON coordenadas_gps(punto_id);
        
        -- Hacer NOT NULL después de agregar datos (si es necesario)
        -- ALTER TABLE coordenadas_gps ALTER COLUMN punto_id SET NOT NULL;
    END IF;
END $$;

-- =====================================================
-- 2. AGREGAR COLUMNA punto_id A image_analyses (si no existe)
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'image_analyses' 
        AND column_name = 'punto_id'
    ) THEN
        ALTER TABLE image_analyses ADD COLUMN punto_id UUID REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE;
        
        CREATE INDEX idx_image_analyses_punto_id ON image_analyses(punto_id);
    END IF;
END $$;

-- =====================================================
-- 3. VERIFICAR ESTRUCTURA ACTUAL
-- =====================================================

-- Ver columnas de coordenadas_gps
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'coordenadas_gps'
ORDER BY ordinal_position;

-- Ver columnas de image_analyses
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- =====================================================
-- 4. CREAR TABLAS FALTANTES DEL SISTEMA (si no existen)
-- =====================================================

-- Tabla principal: puntos_ferroviarios
CREATE TABLE IF NOT EXISTS puntos_ferroviarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_serie INTEGER NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    carpeta_path VARCHAR(500),
    coordenada_lat DECIMAL(10, 8),
    coordenada_lng DECIMAL(11, 8),
    coordenada_z DECIMAL(10, 3),
    estado VARCHAR(50) DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puntos_numero_serie ON puntos_ferroviarios(numero_serie);
CREATE INDEX IF NOT EXISTS idx_puntos_estado ON puntos_ferroviarios(estado);

-- Tabla: documentos_punto
CREATE TABLE IF NOT EXISTS documentos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255),
    contenido TEXT,
    tipo_documento VARCHAR(100) DEFAULT 'txt',
    tamano_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_punto_id ON documentos_punto(punto_id);

-- Tabla: fotos_punto
CREATE TABLE IF NOT EXISTS fotos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    indice INTEGER NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    nombre_formateado VARCHAR(255),
    subcarpeta VARCHAR(255) DEFAULT 'raiz',
    preview_url TEXT,
    storage_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fotos_punto_id ON fotos_punto(punto_id);
CREATE INDEX IF NOT EXISTS idx_fotos_indice ON fotos_punto(indice);

-- Tabla: historial_obras
CREATE TABLE IF NOT EXISTS historial_obras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(100) NOT NULL,
    modulo VARCHAR(100),
    descripcion TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_punto_id ON historial_obras(punto_id);
CREATE INDEX IF NOT EXISTS idx_historial_tipo_evento ON historial_obras(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_historial_created_at ON historial_obras(created_at);

-- Tabla: inspeccion_punto
CREATE TABLE IF NOT EXISTS inspeccion_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    checklist JSONB DEFAULT '{}',
    observaciones TEXT,
    porcentaje_completado INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspeccion_punto_id ON inspeccion_punto(punto_id);

-- Tabla: materiales_punto
CREATE TABLE IF NOT EXISTS materiales_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    cantidad DECIMAL(10, 2),
    unidad VARCHAR(50),
    especificaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materiales_punto_id ON materiales_punto(punto_id);

-- Tabla: riesgos_punto
CREATE TABLE IF NOT EXISTS riesgos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    nivel VARCHAR(20) DEFAULT 'bajo',
    mitigacion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riesgos_punto_id ON riesgos_punto(punto_id);

-- Tabla: ambiental_punto
CREATE TABLE IF NOT EXISTS ambiental_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    impacto TEXT,
    medidas_mitigacion TEXT,
    vegetacion TEXT,
    fauna TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ambiental_punto_id ON ambiental_punto(punto_id);

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

ALTER TABLE puntos_ferroviarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordenadas_gps ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspeccion_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE riesgos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambiental_punto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON puntos_ferroviarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON coordenadas_gps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON documentos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON image_analyses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fotos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON historial_obras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON inspeccion_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON materiales_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON riesgos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ambiental_punto FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- FIN DEL FIX
-- =====================================================
