-- Migración: eliminar riesgos_punto (módulo Respaldo removido)
-- Fecha: 2026-07-08
-- Contexto: el módulo Respaldo fue eliminado del código. riesgos_punto (reutilizada
-- temporalmente para respaldo) queda huérfana y vacía. Se elimina por consistencia
-- con el cleanup de tablas huérfanas (migración 20260707000000).

DROP TABLE IF EXISTS riesgos_punto CASCADE;
