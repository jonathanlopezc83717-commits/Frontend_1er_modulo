-- ========================================================
-- MIGRACIÓN: Sistema de Obras Ferroviarias - Tablas Básicas
-- Fecha: 2025-01-01
-- 
-- Esta migración crea las tablas mínimas necesarias para el sistema
-- Compatible con Supabase Local (sin funciones avanzadas)
-- ========================================================

-- =====================================================
-- 1. TABLA PRINCIPAL: PUNTOS FERROVIARIOS
-- =====================================================
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_puntos_numero_serie ON puntos_ferroviarios(numero_serie);
CREATE INDEX IF NOT EXISTS idx_puntos_estado ON puntos_ferroviarios(estado);

-- =====================================================
-- 2. TABLA: COORDENADAS GPS
-- =====================================================
CREATE TABLE IF NOT EXISTS coordenadas_gps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    coordenada_x DECIMAL(11, 8) NOT NULL,
    coordenada_y DECIMAL(10, 8) NOT NULL,
    coordenada_z DECIMAL(10, 3),
    sistema_coordenadas VARCHAR(50) DEFAULT 'WGS84',
    precision_metros DECIMAL(8, 3),
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coordenadas_punto_id ON coordenadas_gps(punto_id);

-- =====================================================
-- 3. TABLA: DOCUMENTOS TÉCNICOS
-- =====================================================
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

-- =====================================================
-- 4. TABLA: ANÁLISIS DE IMÁGENES (IA)
-- =====================================================
CREATE TABLE IF NOT EXISTS analisis_imagenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    image_url TEXT,
    image_urls JSONB DEFAULT '[]',
    description TEXT,
    objects JSONB DEFAULT '[]',
    mood VARCHAR(255),
    quality VARCHAR(255),
    model_used VARCHAR(100),
    raw_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analisis_punto_id ON analisis_imagenes(punto_id);

-- =====================================================
-- 5. TABLA: FOTOS INDEXADAS
-- =====================================================
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

-- =====================================================
-- 6. TABLA: HISTORIAL DE OBRAS
-- =====================================================
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

-- =====================================================
-- 7. TABLA: INSPECCIÓN / CHECKLIST
-- =====================================================
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

-- =====================================================
-- 8. TABLA: MATERIALES
-- =====================================================
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

-- =====================================================
-- 9. TABLA: RIESGOS DE SEGURIDAD
-- =====================================================
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

-- =====================================================
-- 10. TABLA: ESTUDIO AMBIENTAL
-- =====================================================
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
-- ROW LEVEL SECURITY (RLS) - Permitir todo para desarrollo
-- =====================================================

ALTER TABLE puntos_ferroviarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordenadas_gps ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE analisis_imagenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspeccion_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE riesgos_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambiental_punto ENABLE ROW LEVEL SECURITY;

-- Política: permitir todo (para desarrollo)
CREATE POLICY "Allow all" ON puntos_ferroviarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON coordenadas_gps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON documentos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON analisis_imagenes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON fotos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON historial_obras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON inspeccion_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON materiales_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON riesgos_punto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ambiental_punto FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista completa de puntos con coordenadas
CREATE OR REPLACE VIEW vista_puntos_completo AS
SELECT 
    p.*,
    c.coordenada_x,
    c.coordenada_y,
    c.coordenada_z,
    c.sistema_coordenadas,
    c.notas as coordenadas_notas,
    d.nombre_archivo,
    d.contenido as documento_contenido
FROM puntos_ferroviarios p
LEFT JOIN coordenadas_gps c ON p.id = c.punto_id
LEFT JOIN documentos_punto d ON p.id = d.punto_id
WHERE p.estado = 'activo';

-- Vista de historial con nombres de puntos
CREATE OR REPLACE VIEW vista_historial_completo AS
SELECT 
    h.*,
    p.nombre as punto_nombre,
    p.numero_serie
FROM historial_obras h
JOIN puntos_ferroviarios p ON h.punto_id = p.id
ORDER BY h.created_at DESC;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
