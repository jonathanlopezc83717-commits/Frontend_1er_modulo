-- Migración: eliminar tablas huérfanas sin módulo activo
-- Fecha: 2026-07-07
-- Contexto: inspeccion_punto, ambiental_punto y materiales_punto se crearon en las
-- migraciones iniciales pero ningún código las lee/escribe. ModuloInspeccion y
-- ModuloAmbiental fueron eliminados (dead code). materiales_punto no coincide con el
-- módulo "Formato" actual. Verificadas vacías (0 filas) vía PostgREST antes de aplicar.
-- Nota: riesgos_punto se CONSERVA y reutiliza para el módulo Respaldo (schema compatible).

DROP TABLE IF EXISTS inspeccion_punto CASCADE;
DROP TABLE IF EXISTS ambiental_punto CASCADE;
DROP TABLE IF EXISTS materiales_punto CASCADE;
