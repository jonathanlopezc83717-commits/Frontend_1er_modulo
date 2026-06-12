# Diagnóstico del Historial

## Problema: Historial aparece bloqueado o no muestra imágenes

## Pasos para diagnosticar:

### 1. Verificar la consola del navegador

Abre la aplicación en el navegador y presiona `F12` para abrir las herramientas de desarrollo.

Ve a la pestaña **Console** y busca estos mensajes:
- `Cargando historial...` - Debe aparecer al abrir el historial
- `Datos del historial:` - Debe mostrar los datos obtenidos
- `Historial seleccionado:` - Debe aparecer al hacer clic en un item
- `URLs de imágenes:` - Debe mostrar las URLs de las imágenes

### 2. Verificar la estructura de la tabla

En el SQL Editor de Supabase Studio (http://127.0.0.1:54323), ejecuta:

```sql
-- Verificar columnas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- Verificar datos
SELECT * FROM image_analyses LIMIT 5;

-- Verificar si hay datos
SELECT COUNT(*) as total_registros FROM image_analyses;
```

### 3. Verificar URLs de imágenes

```sql
-- Verificar que las URLs sean válidas
SELECT 
    id,
    image_urls,
    array_length(image_urls, 1) as num_imagenes,
    image_url as url_antigua
FROM image_analyses 
WHERE image_urls IS NOT NULL OR image_url IS NOT NULL
LIMIT 5;
```

### 4. Problemas comunes y soluciones

#### Problema: "No hay análisis previos"
**Causa**: La tabla está vacía o no se ha ejecutado la migración.
**Solución**: 
```sql
-- Verificar si la tabla tiene datos
SELECT COUNT(*) FROM image_analyses;

-- Si está vacía, verificar que la migración se ejecutó
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'image_analyses';
```

#### Problema: Las imágenes no se muestran (error 404)
**Causa**: Las URLs de las imágenes no son válidas o el bucket no existe.
**Solución**:
```sql
-- Verificar que el bucket existe
SELECT * FROM storage.buckets WHERE id = 'images';

-- Verificar políticas de storage
SELECT * FROM storage.policies WHERE bucket_id = 'images';
```

#### Problema: El historial aparece bloqueado
**Causa**: Puede ser un problema de z-index o un overlay bloqueando los clics.
**Solución**: 
1. Abrir DevTools (F12)
2. Ir a Elements
3. Inspeccionar el elemento del historial
4. Verificar que no haya un overlay bloqueando

### 5. Script de reparación completo

Si todo lo demás falla, ejecuta este script para recrear la tabla:

```sql
-- Backup de datos existentes (si los hay)
CREATE TABLE IF NOT EXISTS image_analyses_backup AS 
SELECT * FROM image_analyses;

-- Eliminar tabla existente
DROP TABLE IF EXISTS image_analyses;

-- Crear tabla nueva con estructura correcta
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

-- Restaurar datos del backup (adaptando el formato)
INSERT INTO image_analyses (image_url, description, objects, mood, quality, model_used, created_at)
SELECT image_url, description, objects, mood, quality, model_used, created_at
FROM image_analyses_backup;

-- Migrar image_url a image_urls
UPDATE image_analyses 
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL;

-- Habilitar RLS
ALTER TABLE image_analyses ENABLE ROW LEVEL SECURITY;

-- Crear políticas
CREATE POLICY "Allow public read"
ON image_analyses FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert"
ON image_analyses FOR INSERT
TO public
WITH CHECK (true);

-- Verificar resultado
SELECT * FROM image_analyses LIMIT 5;
```

## Verificación final

Después de aplicar las correcciones:

1. Recarga la aplicación (Ctrl+F5)
2. Sube una imagen y espera el análisis
3. Abre el historial
4. Haz clic en el item
5. Verifica que se muestren las imágenes y el análisis

Si sigue habiendo problemas, revisa la consola del navegador para ver los mensajes de error específicos.