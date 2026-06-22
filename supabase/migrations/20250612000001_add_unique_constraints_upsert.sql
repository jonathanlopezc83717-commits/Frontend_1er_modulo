-- Fix 400 Bad Request on upsert with onConflict=punto_id
-- PostgREST requires the conflict target column to have a unique constraint.

-- 1. Coordinates: remove duplicates keeping the most recent one
DELETE FROM coordenadas_gps
WHERE id NOT IN (
  SELECT DISTINCT ON (punto_id) id
  FROM coordenadas_gps
  ORDER BY punto_id, updated_at DESC NULLS LAST, created_at DESC
);

-- Add unique constraint using DO block to check if exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_coordenadas_gps_punto_id'
    ) THEN
        ALTER TABLE coordenadas_gps
        ADD CONSTRAINT unique_coordenadas_gps_punto_id UNIQUE (punto_id);
    END IF;
END $$;

-- 2. Documents: remove duplicates keeping the most recent one
DELETE FROM documentos_punto
WHERE id NOT IN (
  SELECT DISTINCT ON (punto_id) id
  FROM documentos_punto
  ORDER BY punto_id, updated_at DESC NULLS LAST, created_at DESC
);

-- Add unique constraint using DO block
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_documentos_punto_punto_id'
    ) THEN
        ALTER TABLE documentos_punto
        ADD CONSTRAINT unique_documentos_punto_punto_id UNIQUE (punto_id);
    END IF;
END $$;
