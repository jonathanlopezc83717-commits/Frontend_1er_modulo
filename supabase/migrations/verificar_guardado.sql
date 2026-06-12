-- Script para verificar y corregir el guardado de múltiples imágenes
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar si la tabla existe y su estructura
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 2. Verificar si existe la columna image_urls
DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'image_analyses' 
        AND column_name = 'image_urls'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
        RAISE NOTICE 'La columna image_urls NO existe. Creándola...';
        
        -- Agregar la columna image_urls
        ALTER TABLE image_analyses ADD COLUMN image_urls TEXT[];
        
        -- Migrar datos existentes
        UPDATE image_analyses 
        SET image_urls = ARRAY[image_url]
        WHERE image_url IS NOT NULL;
        
        -- Establecer valor por defecto
        UPDATE image_analyses 
        SET image_urls = ARRAY[]::TEXT[]
        WHERE image_urls IS NULL;
        
        -- Hacer NOT NULL
        ALTER TABLE image_analyses 
        ALTER COLUMN image_urls SET NOT NULL;
        
        RAISE NOTICE 'Columna image_urls creada exitosamente';
    ELSE
        RAISE NOTICE 'La columna image_urls ya existe';
    END IF;
END $$;

-- 3. Verificar datos actuales
SELECT 
    id,
    image_url,
    image_urls,
    array_length(image_urls, 1) as num_images,
    description,
    created_at
FROM image_analyses
ORDER BY created_at DESC
LIMIT 10;

-- 4. Verificar si hay registros con solo 1 imagen cuando deberían tener más
SELECT 
    id,
    image_urls,
    array_length(image_urls, 1) as num_images,
    created_at
FROM image_analyses
WHERE array_length(image_urls, 1) = 1
ORDER BY created_at DESC
LIMIT 5;