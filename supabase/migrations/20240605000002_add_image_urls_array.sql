-- Migración: Agregar soporte para múltiples imágenes (image_urls como array)
-- Fecha: 2024-06-05
-- Descripción: Cambia el almacenamiento de una sola URL a un array de URLs para soportar múltiples imágenes

DO $$
BEGIN
    -- 1. Agregar nueva columna image_urls si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'image_analyses' 
                   AND column_name = 'image_urls') THEN
        ALTER TABLE image_analyses ADD COLUMN image_urls TEXT[];
    END IF;
END $$;

-- 2. Migrar datos existentes de image_url a image_urls
-- Convertir el valor existente de image_url a un array con un solo elemento
UPDATE image_analyses 
SET image_urls = ARRAY[image_url]
WHERE image_urls IS NULL 
  AND image_url IS NOT NULL;

-- 3. Establecer valor por defecto para registros que no tienen image_url
UPDATE image_analyses 
SET image_urls = ARRAY[]::TEXT[]
WHERE image_urls IS NULL;

-- 4. Hacer image_urls NOT NULL
ALTER TABLE image_analyses 
ALTER COLUMN image_urls SET NOT NULL;

-- 5. NOTA: Índice GIN para arrays de texto requiere la extensión intarray o pg_trgm
-- Para mantener compatibilidad, no creamos índice GIN aquí
-- Si se necesita búsqueda eficiente en el futuro, instalar: CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- y crear: CREATE INDEX idx_image_analyses_image_urls ON image_analyses USING GIN (image_urls gin_trgm_ops);

-- 6. Agregar comentario a la columna
COMMENT ON COLUMN image_analyses.image_urls IS 'Array de URLs de imágenes analizadas (máximo 4)';

-- Verificar estructura actual
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;