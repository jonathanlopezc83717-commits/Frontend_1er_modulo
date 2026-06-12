-- ========================================================
-- SQL SIMPLIFICADO para Supabase Local
-- Sin RLS (no requiere storage.policies)
-- ========================================================

-- 1. TABLA PRINCIPAL
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

-- 2. TABLA: DOCUMENTOS
CREATE TABLE IF NOT EXISTS documentos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255),
    contenido TEXT,
    tipo_documento VARCHAR(100) DEFAULT 'txt',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABLA: FOTOS
CREATE TABLE IF NOT EXISTS fotos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    indice INTEGER NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    nombre_formateado VARCHAR(255),
    subcarpeta VARCHAR(255) DEFAULT 'raiz',
    preview_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA: HISTORIAL
CREATE TABLE IF NOT EXISTS historial_obras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(100) NOT NULL,
    modulo VARCHAR(100),
    descripcion TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLA: INSPECCION
CREATE TABLE IF NOT EXISTS inspeccion_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    checklist JSONB DEFAULT '{}',
    observaciones TEXT,
    porcentaje_completado INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABLA: MATERIALES
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

-- 7. TABLA: RIESGOS
CREATE TABLE IF NOT EXISTS riesgos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    nivel VARCHAR(20) DEFAULT 'bajo',
    mitigacion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABLA: AMBIENTAL
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

-- Agregar punto_id a image_analyses si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'image_analyses' 
        AND column_name = 'punto_id'
    ) THEN
        ALTER TABLE image_analyses ADD COLUMN punto_id UUID REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =====================================================
-- FIN
-- =====================================================
