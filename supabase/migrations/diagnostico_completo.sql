-- Script de diagnóstico COMPATIBLE con Supabase Local
-- Sin usar storage.buckets ni storage.policies

-- 1. Verificar si la tabla existe
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'image_analyses';

-- 2. Verificar columnas de la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 3. Verificar restricciones
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'image_analyses';

-- 4. Verificar políticas de RLS (solo si existen)
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'image_analyses';

-- 5. Verificar si RLS está habilitado
SELECT 
    relname,
    relrowsecurity,
    relforcerowsecurity
FROM pg_class 
WHERE relname = 'image_analyses';

-- 6. Contar registros
SELECT COUNT(*) as total_registros FROM image_analyses;

-- 7. Ver últimos registros (limitado a 3)
SELECT * FROM image_analyses ORDER BY created_at DESC LIMIT 3;

-- 8. Verificar tablas del sistema
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name IN ('puntos_ferroviarios', 'coordenadas_gps', 'documentos_punto', 
                   'analisis_imagenes', 'fotos_punto', 'historial_obras',
                   'inspeccion_punto', 'materiales_punto', 'riesgos_punto', 'ambiental_punto')
ORDER BY table_name;

-- 9. Verificar conexión y permisos
SELECT current_user, current_database(), version();
