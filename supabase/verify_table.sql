-- Verificar estructura completa de la tabla
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- Verificar cantidad de registros
SELECT COUNT(*) as total_registros FROM image_analyses;

-- Ver últimos registros con todos los campos
SELECT 
    id,
    image_url,
    LEFT(description, 100) as descripcion_preview,
    objects,
    mood,
    quality,
    model_used,
    created_at
FROM image_analyses 
ORDER BY created_at DESC 
LIMIT 5;
