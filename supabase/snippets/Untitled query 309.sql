-- Script para solucionar el error PGRST204 - Columna no encontrada en schema cache
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar que la columna existe en PostgreSQL
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'image_analyses' 
AND column_name = 'image_urls';

-- 2. Si la columna NO existe, crearla
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'image_analyses' 
                   AND column_name = 'image_urls') THEN
        
        ALTER TABLE image_analyses ADD COLUMN image_urls TEXT[];
        
        UPDATE image_analyses 
        SET image_urls = ARRAY[image_url]
        WHERE image_url IS NOT NULL;
        
        UPDATE image_analyses 
        SET image_urls = ARRAY[]::TEXT[]
        WHERE image_urls IS NULL;
        
        ALTER TABLE image_analyses 
        ALTER COLUMN image_urls SET NOT NULL;
        
        RAISE NOTICE 'Columna image_urls creada';
    ELSE
        RAISE NOTICE 'Columna image_urls ya existe';
    END IF;
END $$;

-- 3. Forzar actualización del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- 4. Verificar que la tabla tiene la estructura correcta
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 5. Verificar datos de prueba
SELECT 
    id,
    array_length(image_urls, 1) as num_images,
    image_urls,
    created_at
FROM image_analyses
ORDER BY created_at DESC
LIMIT 3;