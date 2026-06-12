-- Add unique constraint on punto_id to analisis_imagenes
-- This fixes the 400 Bad Request on upsert with on_conflict=punto_id
-- PostgREST requires the conflict target column to have a unique constraint.

-- First, remove any duplicate rows keeping the most recent one
DELETE FROM analisis_imagenes
WHERE id NOT IN (
  SELECT DISTINCT ON (punto_id) id
  FROM analisis_imagenes
  ORDER BY punto_id, created_at DESC
);

-- Add the unique constraint
ALTER TABLE analisis_imagenes
ADD CONSTRAINT unique_analisis_punto_id UNIQUE (punto_id);
