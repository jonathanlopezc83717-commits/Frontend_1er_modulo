-- Agregar columna model_used si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'image_analyses' 
                   AND column_name = 'model_used') THEN
        ALTER TABLE image_analyses ADD COLUMN model_used TEXT;
    END IF;
END $$;

-- Verificar estructura actual
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_analyses';
