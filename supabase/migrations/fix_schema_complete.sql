-- Script de migración completo para soporte de múltiples imágenes
-- Ejecutar esto en el SQL Editor de Supabase Studio (http://127.0.0.1:54323)

-- 1. Primero verificar qué columnas existen actualmente
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 2. Agregar columnas faltantes si no existen
DO $$
BEGIN
    -- Verificar si la tabla existe
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'image_analyses') THEN
        
        -- Agregar id si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'id') THEN
            ALTER TABLE image_analyses ADD COLUMN id UUID DEFAULT gen_random_uuid() PRIMARY KEY;
        END IF;
        
        -- Agregar image_url si no existe (para compatibilidad)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'image_url') THEN
            ALTER TABLE image_analyses ADD COLUMN image_url TEXT;
        END IF;
        
        -- Agregar image_urls (nueva columna para múltiples imágenes)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'image_urls') THEN
            ALTER TABLE image_analyses ADD COLUMN image_urls TEXT[];
            
            -- Migrar datos existentes de image_url a image_urls
            UPDATE image_analyses 
            SET image_urls = ARRAY[image_url]
            WHERE image_urls IS NULL 
              AND image_url IS NOT NULL;
            
            -- Establecer valor por defecto para registros vacíos
            UPDATE image_analyses 
            SET image_urls = ARRAY[]::TEXT[]
            WHERE image_urls IS NULL;
            
            -- Hacer image_urls NOT NULL
            ALTER TABLE image_analyses 
            ALTER COLUMN image_urls SET NOT NULL;
        END IF;
        
        -- Agregar description si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'description') THEN
            ALTER TABLE image_analyses ADD COLUMN description TEXT;
        END IF;
        
        -- Agregar objects si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'objects') THEN
            ALTER TABLE image_analyses ADD COLUMN objects TEXT[];
        END IF;
        
        -- Agregar mood si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'mood') THEN
            ALTER TABLE image_analyses ADD COLUMN mood TEXT;
        END IF;
        
        -- Agregar quality si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'quality') THEN
            ALTER TABLE image_analyses ADD COLUMN quality TEXT;
        END IF;
        
        -- Agregar model_used si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'model_used') THEN
            ALTER TABLE image_analyses ADD COLUMN model_used TEXT;
        END IF;
        
        -- Agregar created_at si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'image_analyses' 
                       AND column_name = 'created_at') THEN
            ALTER TABLE image_analyses ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        END IF;
        
        RAISE NOTICE 'Migración completada exitosamente';
    ELSE
        RAISE NOTICE 'La tabla image_analyses no existe. Creando tabla...';
        
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
    END IF;
END $$;

-- 3. Verificar estructura final
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'image_analyses'
ORDER BY ordinal_position;

-- 4. Verificar datos (sin especificar columnas para evitar errores)
SELECT * FROM image_analyses LIMIT 5;