# Solución Error PGRST204 - Columna no encontrada en schema cache

## Problema
El error `PGRST204` significa que PostgREST (la API REST de Supabase) no reconoce la columna `image_urls` aunque exista en PostgreSQL.

## Solución Rápida

### Paso 1: Ejecutar el script SQL

Abre **Supabase Studio**: http://127.0.0.1:54323

Ve al **SQL Editor** y ejecuta el contenido de:
`supabase/migrations/fix_pgrst204.sql`

O ejecuta directamente:

```sql
-- Forzar actualización del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
```

### Paso 2: Verificar que funcionó

```sql
-- Verificar que la columna existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_analyses';

-- Deberías ver image_urls con tipo ARRAY o text[]
```

### Paso 3: Probar en la aplicación

1. Recarga la página (Ctrl+F5)
2. Sube 4 imágenes
3. Espera el análisis
4. Revisa la consola del navegador (F12)
5. Deberías ver: `✅ Guardado exitosamente con múltiples imágenes`

## Si NOTIFY no funciona

### Opción A: Reiniciar Supabase

```bash
# En la terminal
supabase stop
supabase start
```

### Opción B: Recrear la tabla con la columna correcta

```sql
-- Backup
CREATE TABLE image_analyses_backup AS SELECT * FROM image_analyses;

-- Eliminar tabla
DROP TABLE IF EXISTS image_analyses;

-- Crear nueva tabla con image_urls desde el inicio
CREATE TABLE image_analyses (
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

-- Restaurar datos
INSERT INTO image_analyses (image_url, description, objects, mood, quality, model_used, created_at)
SELECT image_url, description, objects, mood, quality, model_used, created_at
FROM image_analyses_backup;

-- Migrar URLs
UPDATE image_analyses 
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL;

-- RLS
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON image_analyses FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert" ON image_analyses FOR INSERT TO public WITH CHECK (true);

-- Limpiar backup
DROP TABLE image_analyses_backup;
```

## Verificación final

Después de aplicar la solución:

```sql
-- Verificar estructura
SELECT * FROM image_analyses LIMIT 1;

-- Verificar que image_urls funciona
INSERT INTO image_analyses (image_urls, description)
VALUES (
  ARRAY['http://ejemplo1.jpg', 'http://ejemplo2.jpg', 'http://ejemplo3.jpg'],
  'Prueba de múltiples imágenes'
)
RETURNING *;
```

Si esto funciona, la aplicación también debería funcionar.

## Mensajes esperados en consola

### ✅ Éxito
```
Número de imágenes a guardar: 4
URLs a guardar: ['http://...', 'http://...', 'http://...', 'http://...']
✅ Guardado exitosamente con múltiples imágenes
```

### ❌ Error PGRST204 (antes de solucionar)
```
❌ ERROR PGRST204: PostgREST no reconoce la columna image_urls
Solución: Ejecuta en SQL Editor: NOTIFY pgrst, 'reload schema';
```