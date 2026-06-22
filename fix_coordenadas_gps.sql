-- Verificar si existe la constraint UNIQUE
SELECT tc.constraint_name, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_name = 'coordenadas_gps'
    AND kcu.column_name = 'punto_id';

-- Contar duplicados
SELECT punto_id, COUNT(*) as count
FROM coordenadas_gps
GROUP BY punto_id
HAVING COUNT(*) > 1;

-- Si hay duplicados, eliminarlos manteniendo el más reciente
DELETE FROM coordenadas_gps
WHERE id NOT IN (
    SELECT DISTINCT ON (punto_id) id
    FROM coordenadas_gps
    ORDER BY punto_id, updated_at DESC NULLS LAST, created_at DESC
);

-- Agregar la constraint UNIQUE si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_coordenadas_gps_punto_id'
    ) THEN
        ALTER TABLE coordenadas_gps
        ADD CONSTRAINT unique_coordenadas_gps_punto_id UNIQUE (punto_id);
    END IF;
END $$;
