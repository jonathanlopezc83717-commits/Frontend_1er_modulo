-- Crear tabla para análisis de imágenes (versión actualizada)
CREATE TABLE IF NOT EXISTS image_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  description TEXT,
  objects TEXT[],
  mood TEXT,
  quality TEXT,
  model_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir acceso público (desarrollo local)
CREATE POLICY "Allow public read"
ON image_analyses FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert"
ON image_analyses FOR INSERT
TO public
WITH CHECK (true);

-- Crear bucket de storage para imágenes
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'images');

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'images');
