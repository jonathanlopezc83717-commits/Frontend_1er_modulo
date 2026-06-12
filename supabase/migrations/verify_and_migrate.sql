-- Script para verificar y ejecutar la migración de múltiples imágenes
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar si la columna image_urls existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 2. Si no existe image_urls, ejecutar esta migración:
DO $$
BEGIN
    -- Agregar nueva columna image_urls si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'image_analyses' 
                   AND column_name = 'image_urls') THEN
        ALTER TABLE image_analyses ADD COLUMN image_urls TEXT[];
        
        -- Migrar datos existentes de image_url a image_urls
        UPDATE image_analyses 
        SET image_urls = ARRAY[image_url]
        WHERE image_urls IS NULL 
          AND image_url IS NOT NULL;
        
        -- Establecer valor por defecto para registros que no tienen image_url
        UPDATE image_analyses 
        SET image_urls = ARRAY[]::TEXT[]
        WHERE image_urls IS NULL;
        
        -- Hacer image_urls NOT NULL
        ALTER TABLE image_analyses 
        ALTER COLUMN image_urls SET NOT NULL;
        
        -- NOTA: Índice GIN para arrays de texto requiere extensión pg_trgm
        -- Para mantener compatibilidad, no creamos índice GIN aquí
        -- Si se necesita en el futuro: CREATE EXTENSION IF NOT EXISTS pg_trgm;
        -- y luego: CREATE INDEX idx_image_analyses_image_urls ON image_analyses USING GIN (image_urls gin_trgm_ops);
        
        RAISE NOTICE 'Migración completada exitosamente';
    ELSE
        RAISE NOTICE 'La columna image_urls ya existe';
    END IF;
END $$;

-- 3. Verificar datos migrados (usando * para evitar problemas con columnas inexistentes)
SELECT *
FROM image_analyses
ORDER BY created_at DESC
LIMIT 5;