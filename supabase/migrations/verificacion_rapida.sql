-- Verificación rápida después de reiniciar Supabase
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar que la tabla existe y tiene la estructura correcta
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 2. Verificar si hay datos
SELECT COUNT(*) as total_registros FROM image_analyses;

-- 3. Ver últimos registros (si los hay)
SELECT 
    id,
    image_url,
    image_urls,
    array_length(image_urls, 1) as num_imagenes,
    description,
    created_at
FROM image_analyses
ORDER BY created_at DESC
LIMIT 5;

-- 4. Si no hay datos, la tabla está vacía después del reinicio
-- Si necesitas datos de prueba, ejecuta:
/*
INSERT INTO image_analyses (image_urls, description, objects, model_used)
VALUES (
    ARRAY['http://ejemplo1.jpg', 'http://ejemplo2.jpg', 'http://ejemplo3.jpg', 'http://ejemplo4.jpg'],
    'Prueba de múltiples imágenes',
    ARRAY['rieles', 'durmientes', 'balasto'],
    'GPT-4o'
);
*/