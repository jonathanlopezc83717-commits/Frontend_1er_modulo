-- Crear bucket de storage para imágenes
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Políticas de storage para el bucket images
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'images');

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'images');

-- Crear tabla para análisis de imágenes
CREATE TABLE IF NOT EXISTS image_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  description TEXT,
  objects TEXT[],
  colors TEXT[],
  mood TEXT,
  quality TEXT,
  suggestions TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas RLS para la tabla
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
ON image_analyses FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert"
ON image_analyses FOR INSERT
TO public
WITH CHECK (true);
