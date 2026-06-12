-- Verificación y creación de tabla después de reiniciar Supabase
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Verificar si la tabla existe
SELECT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'image_analyses'
) as tabla_existe;

-- 2. Si no existe, crear la tabla
CREATE TABLE IF NOT EXISTS image_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  description TEXT,
  objects TEXT[],
  mood TEXT,
  quality TEXT,
  model_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Habilitar RLS
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas
CREATE POLICY IF NOT EXISTS "Allow public read"
ON image_analyses FOR SELECT
TO public
USING (true);

CREATE POLICY IF NOT EXISTS "Allow public insert"
ON image_analyses FOR INSERT
TO public
WITH CHECK (true);

-- 5. Verificar estructura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 6. Insertar datos de prueba
INSERT INTO image_analyses (image_urls, description, objects, model_used)
VALUES (
    ARRAY['https://placehold.co/400x300?text=Imagen+1', 'https://placehold.co/400x300?text=Imagen+2', 'https://placehold.co/400x300?text=Imagen+3', 'https://placehold.co/400x300?text=Imagen+4'],
    'Prueba de múltiples imágenes después de reiniciar Supabase',
    ARRAY['rieles', 'durmientes', 'balasto', 'terraplén'],
    'GPT-4o'
)
RETURNING *;

-- 7. Verificar datos
SELECT * FROM image_analyses ORDER BY created_at DESC LIMIT 5;