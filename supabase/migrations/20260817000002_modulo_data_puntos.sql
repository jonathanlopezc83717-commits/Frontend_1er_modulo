-- ========================================================
-- MIGRACIÓN: columna modulo_data en puntos_ferroviarios
-- Persiste el árbol completo de moduloData (croquis, materiales, etc.)
-- con las imágenes data:image ya resueltas a URLs de Storage desde el
-- cliente (construirPayloadPunto). guardar_punto_completo la escribe y
-- cargar_puntos_completos la devuelve, cerrando el round-trip de módulos.
-- COALESCE en el UPDATE: payloads sin modulo_data (clientes previos)
-- no borran el valor existente.
-- ========================================================

ALTER TABLE puntos_ferroviarios ADD COLUMN IF NOT EXISTS modulo_data JSONB;

-- ========================================================
-- RPC transaccional guardar_punto_completo (recreado con modulo_data)
-- ========================================================

DROP FUNCTION IF EXISTS guardar_punto_completo(jsonb);

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
        coordenada_lat, coordenada_lng, coordenada_z, estado, modulo_data, updated_at
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
        v_punto->'modulo_data',
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
        modulo_data    = COALESCE(EXCLUDED.modulo_data, puntos_ferroviarios.modulo_data),
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
-- RPC cargar_puntos_completos (recreada incluyendo modulo_data)
-- ========================================================

DROP FUNCTION IF EXISTS cargar_puntos_completos();

CREATE OR REPLACE FUNCTION cargar_puntos_completos()
RETURNS jsonb
LANGUAGE sql
AS $$
    SELECT COALESCE(
        jsonb_agg(punto_obj ORDER BY numero_serie ASC),
        '[]'::jsonb
    )
    FROM (
        SELECT
            p.numero_serie,
            jsonb_build_object(
                'id', p.id,
                'numero_serie', p.numero_serie,
                'nombre', p.nombre,
                'descripcion', p.descripcion,
                'carpeta_path', p.carpeta_path,
                'coordenada_lat', p.coordenada_lat,
                'coordenada_lng', p.coordenada_lng,
                'coordenada_z', p.coordenada_z,
                'estado', p.estado,
                'created_at', p.created_at,
                'updated_at', p.updated_at,
                'modulo_data', p.modulo_data,
                'coordenadas_gps', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'punto_id', c.punto_id,
                        'latitud', c.coordenada_y,
                        'longitud', c.coordenada_x,
                        'altitud', c.coordenada_z,
                        'notas', c.notas
                    ))
                    FROM coordenadas_gps c
                    WHERE c.punto_id = p.id
                ),
                'documentos_punto', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', d.id,
                        'punto_id', d.punto_id,
                        'nombre_archivo', d.nombre_archivo,
                        'contenido', d.contenido,
                        'tipo_documento', d.tipo_documento
                    ))
                    FROM documentos_punto d
                    WHERE d.punto_id = p.id
                ),
                'analisis_imagenes', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', a.id,
                        'punto_id', a.punto_id,
                        'image_url', a.image_url,
                        'image_urls', a.image_urls,
                        'description', a.description,
                        'objects', a.objects,
                        'mood', a.mood,
                        'quality', a.quality,
                        'model_used', a.model_used
                    ))
                    FROM analisis_imagenes a
                    WHERE a.punto_id = p.id
                ),
                'fotos_punto', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', f.id,
                        'punto_id', f.punto_id,
                        'indice', f.indice,
                        'nombre_archivo', f.nombre_archivo,
                        'nombre_formateado', f.nombre_formateado,
                        'subcarpeta', f.subcarpeta,
                        'preview_url', f.preview_url
                    ) ORDER BY f.indice ASC)
                    FROM fotos_punto f
                    WHERE f.punto_id = p.id
                )
            ) AS punto_obj
        FROM puntos_ferroviarios p
        WHERE p.estado = 'activo'
    ) puntos;
$$;
