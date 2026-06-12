# Solución para Guardar Múltiples Imágenes

## Problema
El historial solo guarda 1 imagen aunque se carguen 4.

## Causa Probable
La columna `image_urls` (tipo array) no existe en la base de datos, por lo que el sistema usa el fallback `image_url` (tipo texto) que solo guarda 1 imagen.

## Solución Paso a Paso

### Paso 1: Verificar la estructura de la tabla

Abre Supabase Studio: http://127.0.0.1:54323

Ve al **SQL Editor** y ejecuta:

```sql
-- Verificar columnas existentes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;
```

**Resultado esperado:**
- Deberías ver `image_urls` con tipo `ARRAY` o `text[]`
- Si NO está, debes ejecutar la migración

### Paso 2: Ejecutar la migración

Si la columna `image_urls` NO existe, ejecuta este SQL:

```sql
-- Agregar columna image_urls si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'image_analyses' 
                   AND column_name = 'image_urls') THEN
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

-- Verificar resultado
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_analyses';
```

### Paso 3: Probar el guardado

1. Abre la aplicación: http://localhost:5173
2. Abre la consola del navegador (F12)
3. Sube 4 imágenes
4. Espera el análisis
5. Revisa los mensajes en la consola:
   - `Número de imágenes a guardar: 4`
   - `URLs a guardar: [url1, url2, url3, url4]`
   - `✅ Guardado exitosamente con múltiples imágenes`

### Paso 4: Verificar en la base de datos

```sql
-- Verificar que se guardaron múltiples imágenes
SELECT 
    id,
    image_urls,
    array_length(image_urls, 1) as num_images,
    created_at
FROM image_analyses
ORDER BY created_at DESC
LIMIT 5;
```

**Resultado esperado:**
- `num_images` debería ser 4 (o el número de imágenes que subiste)

## Si sigue sin funcionar

### Opción A: Reiniciar la base de datos

```bash
# En la terminal, en la carpeta del proyecto
supabase db reset
```

### Opción B: Recrear la tabla completa

```sql
-- Backup de datos
CREATE TABLE IF NOT EXISTS image_analyses_backup AS 
SELECT * FROM image_analyses;

-- Eliminar tabla
DROP TABLE IF EXISTS image_analyses;

-- Crear tabla nueva
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

-- Habilitar RLS
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
ON image_analyses FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert"
ON image_analyses FOR INSERT TO public WITH CHECK (true);
```

## Mensajes de la consola

Si ves estos mensajes en la consola del navegador:

### ✅ Éxito
```
Número de imágenes a guardar: 4
URLs a guardar: ['http://...', 'http://...', 'http://...', 'http://...']
✅ Guardado exitosamente con múltiples imágenes
```

### ⚠️ Problema con la base de datos
```
⚠️ La columna image_urls no existe. Intentando con image_url...
⚠️ ADVERTENCIA: Solo se guardará la primera imagen
```

**Solución:** Ejecuta la migración del Paso 2.

## Verificación final

Después de solucionar:

1. Sube 4 imágenes
2. Abre el historial
3. Deberías ver:
   - 4 miniaturas por entrada
   - El contador "4 imagen(es)"
   - Al hacer clic, se muestran las 4 imágenes