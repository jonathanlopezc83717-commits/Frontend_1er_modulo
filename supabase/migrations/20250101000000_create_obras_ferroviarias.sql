-- ========================================================
-- MIGRACIÓN: Sistema de Obras Ferroviarias
-- Tablas: puntos_ferroviarios, coordenadas_gps, 
--         documentos_punto, analisis_imagenes, historial_obras
-- ========================================================

-- 1. Tabla principal de Puntos Ferroviarios
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

-- Índices para puntos_ferroviarios
CREATE INDEX IF NOT EXISTS idx_puntos_numero_serie ON puntos_ferroviarios(numero_serie);
CREATE INDEX IF NOT EXISTS idx_puntos_estado ON puntos_ferroviarios(estado);
CREATE INDEX IF NOT EXISTS idx_puntos_created_at ON puntos_ferroviarios(created_at);

-- 2. Tabla de Coordenadas GPS (histórico y detallado)
CREATE TABLE IF NOT EXISTS coordenadas_gps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    coordenada_x DECIMAL(11, 8) NOT NULL,  -- Longitud
    coordenada_y DECIMAL(10, 8) NOT NULL,  -- Latitud
    coordenada_z DECIMAL(10, 3),           -- Altitud/elevación
    sistema_coordenadas VARCHAR(50) DEFAULT 'WGS84',
    precision_metros DECIMAL(8, 3),
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coordenadas_punto_id ON coordenadas_gps(punto_id);

-- 3. Tabla de Documentos Técnicos
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

-- 4. Tabla de Análisis de Imágenes (resultados de IA)
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
CREATE INDEX IF NOT EXISTS idx_analisis_created_at ON analisis_imagenes(created_at);

-- 5. Tabla de Fotos Indexadas por Punto
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

-- 6. Tabla de Historial de Obras (cambios y estados)
CREATE TABLE IF NOT EXISTS historial_obras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(100) NOT NULL,  -- 'creacion', 'actualizacion', 'analisis', 'georeferencia', 'documentacion', etc.
    modulo VARCHAR(100),                -- 'analisis', 'georeferencia', 'documentacion', etc.
    descripcion TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_punto_id ON historial_obras(punto_id);
CREATE INDEX IF NOT EXISTS idx_historial_tipo_evento ON historial_obras(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_historial_created_at ON historial_obras(created_at);

-- 7. Tabla de Estados/Checklist de Inspección
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

-- 8. Tabla de Materiales por Punto
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

-- 9. Tabla de Riesgos de Seguridad
CREATE TABLE IF NOT EXISTS riesgos_punto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    nivel VARCHAR(20) DEFAULT 'bajo',  -- 'bajo', 'medio', 'alto', 'critico'
    mitigacion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riesgos_punto_id ON riesgos_punto(punto_id);

-- 10. Tabla de Estudio Ambiental
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

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE OR REPLACE TRIGGER update_puntos_ferroviarios_updated_at 
    BEFORE UPDATE ON puntos_ferroviarios 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_coordenadas_gps_updated_at 
    BEFORE UPDATE ON coordenadas_gps 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_documentos_punto_updated_at 
    BEFORE UPDATE ON documentos_punto 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_inspeccion_punto_updated_at 
    BEFORE UPDATE ON inspeccion_punto 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_materiales_punto_updated_at 
    BEFORE UPDATE ON materiales_punto 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_riesgos_punto_updated_at 
    BEFORE UPDATE ON riesgos_punto 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_ambiental_punto_updated_at 
    BEFORE UPDATE ON ambiental_punto 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas de Row Level Security (RLS) - opcional, para autenticación
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

-- Insertar datos de ejemplo (opcional)
-- INSERT INTO puntos_ferroviarios (numero_serie, nombre, descripcion, carpeta_path) 
-- VALUES (1, 'Punto Ejemplo', 'Punto de prueba', 'Carpeta-Punto-01');
