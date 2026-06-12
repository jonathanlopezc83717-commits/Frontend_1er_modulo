-- Script de diagnóstico completo para el historial
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar si la tabla existe
SELECT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'image_analyses'
) as tabla_existe;

-- 2. Verificar estructura de la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 3. Contar registros
SELECT COUNT(*) as total_registros FROM image_analyses;

-- 4. Ver últimos registros (sin filtrar por columnas específicas)
SELECT * FROM image_analyses ORDER BY created_at DESC LIMIT 5;

-- 5. Verificar políticas de RLS
SELECT * FROM pg_policies WHERE tablename = 'image_analyses';

-- 6. Verificar si el bucket de storage existe
SELECT * FROM storage.buckets WHERE id = 'images';

-- 7. Prueba de inserción (opcional - descomentar si quieres probar)
/*
INSERT INTO image_analyses (image_url, description, objects, mood, quality, model_used)
VALUES (
    'http://ejemplo.com/test.jpg',
    'Prueba de diagnóstico',
    ARRAY['objeto1', 'objeto2'],
    'Soleado',
    'Buena',
    'GPT-4o'
)
RETURNING *;
*/