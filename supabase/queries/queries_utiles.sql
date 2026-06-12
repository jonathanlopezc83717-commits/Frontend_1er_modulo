-- ========================================================
-- QUERIES ÚTILES PARA EL SISTEMA DE OBRAS FERROVIARIAS
-- ========================================================

-- 1. INSERTAR UN NUEVO PUNTO FERROVIARIO
INSERT INTO puntos_ferroviarios (numero_serie, nombre, descripcion, carpeta_path, coordenada_lat, coordenada_lng, coordenada_z)
VALUES (1, 'Punto KM 15+200', 'Descripción del punto', 'Carpeta-Punto-01', -33.4567, -70.6789, 450.50)
RETURNING id;

-- 2. INSERTAR COORDENADAS GPS PARA UN PUNTO
INSERT INTO coordenadas_gps (punto_id, coordenada_x, coordenada_y, coordenada_z, notas)
VALUES ('uuid-del-punto', -70.6789, -33.4567, 450.50, 'Coordenadas del KMZ')
ON CONFLICT (punto_id) DO UPDATE SET
    coordenada_x = EXCLUDED.coordenada_x,
    coordenada_y = EXCLUDED.coordenada_y,
    coordenada_z = EXCLUDED.coordenada_z,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- 3. INSERTAR DOCUMENTO TÉCNICO
INSERT INTO documentos_punto (punto_id, nombre_archivo, contenido, tipo_documento)
VALUES ('uuid-del-punto', 'documento.txt', 'Contenido del documento...', 'txt')
ON CONFLICT (punto_id) DO UPDATE SET
    nombre_archivo = EXCLUDED.nombre_archivo,
    contenido = EXCLUDED.contenido,
    updated_at = NOW();

-- 4. INSERTAR ANÁLISIS DE IMÁGENES
INSERT INTO analisis_imagenes (punto_id, image_urls, description, objects, mood, quality, model_used)
VALUES (
    'uuid-del-punto', 
    '["url1.jpg", "url2.jpg"]', 
    'Descripción del análisis', 
    '["riel", "durmiente"]', 
    'Soleado', 
    'Buena', 
    'GPT-4o'
)
ON CONFLICT (punto_id) DO UPDATE SET
    image_urls = EXCLUDED.image_urls,
    description = EXCLUDED.description,
    objects = EXCLUDED.objects,
    mood = EXCLUDED.mood,
    quality = EXCLUDED.quality,
    model_used = EXCLUDED.model_used;

-- 5. INSERTAR FOTOS INDEXADAS
INSERT INTO fotos_punto (punto_id, indice, nombre_archivo, nombre_formateado, subcarpeta, preview_url)
VALUES 
    ('uuid-del-punto', 1, '1.frente.jpg', '1 - frente', 'fotos', 'data:image/...'),
    ('uuid-del-punto', 2, '2.lateral.jpg', '2 - lateral', 'fotos', 'data:image/...');

-- 6. REGISTRAR EVENTO EN HISTORIAL
INSERT INTO historial_obras (punto_id, tipo_evento, modulo, descripcion, datos_nuevos)
VALUES (
    'uuid-del-punto', 
    'actualizacion', 
    'georeferencia', 
    'Coordenadas actualizadas',
    '{"x": -70.6789, "y": -33.4567}'::jsonb
);

-- 7. OBTENER TODOS LOS PUNTOS CON SUS RELACIONES
SELECT 
    p.*,
    c.coordenada_x, c.coordenada_y, c.coordenada_z,
    d.nombre_archivo, d.contenido,
    a.description, a.objects, a.model_used
FROM puntos_ferroviarios p
LEFT JOIN coordenadas_gps c ON p.id = c.punto_id
LEFT JOIN documentos_punto d ON p.id = d.punto_id
LEFT JOIN analisis_imagenes a ON p.id = a.punto_id
WHERE p.estado = 'activo'
ORDER BY p.numero_serie;

-- 8. OBTENER HISTORIAL COMPLETO CON NOMBRES DE PUNTOS
SELECT 
    h.*,
    p.nombre as punto_nombre,
    p.numero_serie
FROM historial_obras h
JOIN puntos_ferroviarios p ON h.punto_id = p.id
ORDER BY h.created_at DESC
LIMIT 100;

-- 9. ACTUALIZAR ESTADO DE UN PUNTO (ELIMINAR LÓGICAMENTE)
UPDATE puntos_ferroviarios 
SET estado = 'eliminado', updated_at = NOW() 
WHERE id = 'uuid-del-punto';

-- 10. OBTENER ESTADÍSTICAS DEL SISTEMA
SELECT 
    COUNT(*) as total_puntos,
    COUNT(CASE WHEN estado = 'activo' THEN 1 END) as puntos_activos,
    COUNT(CASE WHEN estado = 'eliminado' THEN 1 END) as puntos_eliminados,
    MAX(created_at) as ultimo_punto_creado
FROM puntos_ferroviarios;

-- 11. OBTENER PUNTOS SIN COORDENADAS
SELECT p.*
FROM puntos_ferroviarios p
LEFT JOIN coordenadas_gps c ON p.id = c.punto_id
WHERE p.estado = 'activo' AND c.id IS NULL;

-- 12. OBTENER PUNTOS SIN DOCUMENTACIÓN
SELECT p.*
FROM puntos_ferroviarios p
LEFT JOIN documentos_punto d ON p.id = d.punto_id
WHERE p.estado = 'activo' AND d.id IS NULL;

-- 13. BUSCAR EN EL HISTORIAL POR TIPO DE EVENTO
SELECT * FROM historial_obras 
WHERE tipo_evento = 'analisis' 
ORDER BY created_at DESC 
LIMIT 50;

-- 14. OBTENER FOTOS POR SUBCARPETA
SELECT 
    p.nombre,
    f.subcarpeta,
    COUNT(*) as cantidad_fotos
FROM fotos_punto f
JOIN puntos_ferroviarios p ON f.punto_id = p.id
GROUP BY p.nombre, f.subcarpeta
ORDER BY p.nombre, f.subcarpeta;

-- 15. BACKUP: EXPORTAR TODOS LOS DATOS DE UN PUNTO
SELECT 
    p.*,
    to_jsonb(c.*) as coordenadas,
    to_jsonb(d.*) as documento,
    to_jsonb(a.*) as analisis,
    (SELECT jsonb_agg(f.*) FROM fotos_punto f WHERE f.punto_id = p.id) as fotos,
    (SELECT jsonb_agg(h.*) FROM historial_obras h WHERE h.punto_id = p.id) as historial
FROM puntos_ferroviarios p
LEFT JOIN coordenadas_gps c ON p.id = c.punto_id
LEFT JOIN documentos_punto d ON p.id = d.punto_id
LEFT JOIN analisis_imagenes a ON p.id = a.punto_id
WHERE p.id = 'uuid-del-punto';
