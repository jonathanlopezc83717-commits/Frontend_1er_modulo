-- ========================================================
-- MIGRACIÓN: RPC cargar_puntos_completos (espejo de lectura)
-- Devuelve todos los puntos activos con sus 4 relaciones en un solo
-- round-trip, colapsando las 5 consultas paralelas del cliente.
-- Espejo de lectura de guardar_punto_completo (mismo patrón RPC).
--
-- Las relaciones 1:1 (coordenadas, documentos, análisis) se devuelven
-- como array de 1 elemento (o null si no existe) para encajar directo
-- con el tipo PuntoDB / puntoFromDB del cliente, sin adaptadores.
-- ========================================================

-- Idempotencia
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
