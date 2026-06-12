# Script de Verificación - Múltiples Imágenes

## Pasos para verificar que todo funciona correctamente:

### 1. Verificar que la migración se ejecutó

Abre Supabase Studio: http://127.0.0.1:54323

Ve a **SQL Editor** y ejecuta:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;
```

Deberías ver:
- `image_urls` con tipo `ARRAY` (o `text[]`)
- `image_url` (opcional, para compatibilidad)

### 2. Si la columna no existe, ejecutar la migración

En el SQL Editor, ejecuta el contenido del archivo:
`supabase/migrations/20240605000002_add_image_urls_array.sql`

O usa el CLI:
```bash
supabase db reset
```

### 3. Verificar el funcionamiento

1. Abre la aplicación: http://localhost:5173
2. Sube 2-4 imágenes
3. Espera que el análisis complete
4. Abre el **Historial**
5. Deberías ver:
   - Múltiples miniaturas por entrada
   - El contador "X imagen(es)"
   - Al hacer clic, ver todas las imágenes en la vista detalle

### 4. Verificar en la base de datos

```sql
SELECT id, image_urls, array_length(image_urls, 1) as num_images, description, created_at
FROM image_analyses
ORDER BY created_at DESC
LIMIT 5;
```

Deberías ver `num_images` > 1 para entradas con múltiples imágenes.

## Solución de Problemas

### Error: "column image_urls does not exist"

La migración no se ejecutó. Ejecuta:
```bash
supabase migration up
```

O reinicia la base de datos:
```bash
supabase db reset
```

### Error: "null value in column image_urls violates not-null constraint"

Ejecuta:
```sql
UPDATE image_analyses 
SET image_urls = ARRAY[]::TEXT[]
WHERE image_urls IS NULL;
```

### Las imágenes no se muestran en el historial

Verifica que las URLs sean accesibles:
```sql
SELECT image_urls 
FROM image_analyses 
ORDER BY created_at DESC 
LIMIT 1;
```

Las URLs deberían ser como:
`http://127.0.0.1:54321/storage/v1/object/public/images/...`