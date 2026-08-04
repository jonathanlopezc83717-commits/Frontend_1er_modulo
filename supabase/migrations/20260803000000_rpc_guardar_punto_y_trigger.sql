-- ========================================================
-- MIGRACIÓN: RPC transaccional guardar_punto_completo + trigger de historial
-- Reemplaza las 5-6 escrituras no-transaccionales del cliente por una sola
-- transacción PL/pgSQL. El historial de puntos se registra automáticamente
-- vía trigger AFTER INSERT/UPDATE sobre puntos_ferroviarios.
-- ========================================================

-- Idempotencia: limpieza en orden inverso a la creación
DROP TRIGGER IF EXISTS tg_puntos_historial ON puntos_ferroviarios;
DROP FUNCTION IF EXISTS fn_puntos_historial();
DROP FUNCTION IF EXISTS guardar_punto_completo(jsonb);

-- ========================================================
-- 1. RPC TRANSACCIONAL
--    Recibe un payload jsonb armado por el cliente y ejecuta todas las
--    escrituras en una sola transacción. Ante cualquier error hace
--    ROLLBACK implícito (bloque BEGIN...EXCEPTION) y devuelve {success:false}.
-- ========================================================

CREATE OR REPLACE FUNCTION guardar_punto_completo(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_punto_id uuid := (p_payload->'punto'->>'id')::uuid;
    v_punto    jsonb := p_payload->'punto';
    v_coord    jsonb := p_payload->'coordenadas';
    v_doc      jsonb := p_payload->'documentos';
    v_analisis jsonb := p_payload->'analisis';
    v_fotos    jsonb := p_payload->'fotos';
BEGIN
    -- 1a. Punto principal (upsert por PK id)
    INSERT INTO puntos_ferroviarios (
        id, numero_serie, nombre, descripcion, carpeta_path,
        coordenada_lat, coordenada_lng, coordenada_z, estado, updated_at
    ) VALUES (
        v_punto_id,
        (v_punto->>'numero_serie')::int,
        v_punto->>'nombre',
        v_punto->>'descripcion',
        v_punto->>'carpeta_path',
        NULLIF(v_punto->>'coordenada_lat', '')::numeric,
        NULLIF(v_punto->>'coordenada_lng', '')::numeric,
        NULLIF(v_punto->>'coordenada_z', '')::numeric,
        COALESCE(v_punto->>'estado', 'activo'),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        numero_serie   = EXCLUDED.numero_serie,
        nombre         = EXCLUDED.nombre,
        descripcion    = EXCLUDED.descripcion,
        carpeta_path   = EXCLUDED.carpeta_path,
        coordenada_lat = EXCLUDED.coordenada_lat,
        coordenada_lng = EXCLUDED.coordenada_lng,
        coordenada_z   = EXCLUDED.coordenada_z,
        estado         = EXCLUDED.estado,
        updated_at     = now();

    -- 1b. Coordenadas GPS (upsert por punto_id, sólo si viene en el payload)
    IF v_coord IS NOT NULL THEN
        INSERT INTO coordenadas_gps (
            punto_id, coordenada_x, coordenada_y, coordenada_z, notas, updated_at
        ) VALUES (
            v_punto_id,
            NULLIF(v_coord->>'coordenada_x', '')::numeric,
            NULLIF(v_coord->>'coordenada_y', '')::numeric,
            NULLIF(v_coord->>'coordenada_z', '')::numeric,
            v_coord->>'notas',
            now()
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            coordenada_x = EXCLUDED.coordenada_x,
            coordenada_y = EXCLUDED.coordenada_y,
            coordenada_z = EXCLUDED.coordenada_z,
            notas        = EXCLUDED.notas,
            updated_at   = now();
    END IF;

    -- 1c. Documentación (upsert por punto_id, sólo si viene en el payload)
    IF v_doc IS NOT NULL THEN
        INSERT INTO documentos_punto (
            punto_id, nombre_archivo, contenido, updated_at
        ) VALUES (
            v_punto_id,
            v_doc->>'nombre_archivo',
            v_doc->>'contenido',
            now()
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            nombre_archivo = EXCLUDED.nombre_archivo,
            contenido      = EXCLUDED.contenido,
            updated_at     = now();
    END IF;

    -- 1d. Análisis (upsert por punto_id, sólo si viene en el payload)
    --     image_urls y objects son columnas JSONB: se asignan directo desde
    --     el payload (ya son jsonb), sin conversión a text[].
    IF v_analisis IS NOT NULL THEN
        INSERT INTO analisis_imagenes (
            punto_id, image_urls, description, objects, mood, quality, model_used
        ) VALUES (
            v_punto_id,
            COALESCE(v_analisis->'image_urls', '[]'::jsonb),
            v_analisis->>'description',
            COALESCE(v_analisis->'objects', '[]'::jsonb),
            v_analisis->>'mood',
            v_analisis->>'quality',
            v_analisis->>'model_used'
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            image_urls  = EXCLUDED.image_urls,
            description = EXCLUDED.description,
            objects     = EXCLUDED.objects,
            mood        = EXCLUDED.mood,
            quality     = EXCLUDED.quality,
            model_used  = EXCLUDED.model_used;
    END IF;

    -- 1e. Fotos: si el array viene y NO es vacío -> reemplazo (delete + insert).
    --     Si es null o vacío -> NO se tocan las fotos existentes.
    IF v_fotos IS NOT NULL AND jsonb_array_length(v_fotos) > 0 THEN
        DELETE FROM fotos_punto WHERE punto_id = v_punto_id;

        INSERT INTO fotos_punto (
            punto_id, indice, nombre_archivo, nombre_formateado, subcarpeta, preview_url
        )
        SELECT
            v_punto_id,
            (f.obj->>'indice')::int,
            f.obj->>'nombre_archivo',
            f.obj->>'nombre_formateado',
            f.obj->>'subcarpeta',
            f.obj->>'preview_url'
        FROM jsonb_array_elements(v_fotos) AS f(obj);
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ========================================================
-- 2. TRIGGER FUNCTION: historial automático de puntos
--    Disparada AFTER INSERT/UPDATE sobre puntos_ferroviarios.
--    Garantiza que el historial nunca se pierda (transaccional).
-- ========================================================

CREATE OR REPLACE FUNCTION fn_puntos_historial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_obras (
            punto_id, tipo_evento, modulo, descripcion, datos_nuevos
        ) VALUES (
            NEW.id,
            'creacion',
            'general',
            'Punto ' || NEW.nombre || ' creado',
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO historial_obras (
            punto_id, tipo_evento, modulo, descripcion, datos_anteriores, datos_nuevos
        ) VALUES (
            NEW.id,
            'actualizacion',
            'general',
            'Punto ' || NEW.nombre || ' actualizado',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_puntos_historial
    AFTER INSERT OR UPDATE ON puntos_ferroviarios
    FOR EACH ROW EXECUTE FUNCTION fn_puntos_historial();
