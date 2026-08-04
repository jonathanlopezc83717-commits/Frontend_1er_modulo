-- ========================================================
-- R3-001 fix: trigger detecta soft-delete (estado='eliminado') y emite 'eliminacion'
-- Antes: toda UPDATE generaba 'actualizacion', lo que producia un historial
-- misleading para eliminarPuntoDB (que hace soft-delete via update estado).
-- Ahora: la UPDATE que cambia estado a 'eliminado' genera 'eliminacion'.
-- Idempotente via CREATE OR REPLACE FUNCTION (no toca el trigger, solo la fn).
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
        IF NEW.estado = 'eliminado' AND (OLD.estado IS DISTINCT FROM 'eliminado') THEN
            INSERT INTO historial_obras (
                punto_id, tipo_evento, modulo, descripcion, datos_anteriores, datos_nuevos
            ) VALUES (
                NEW.id,
                'eliminacion',
                'general',
                'Punto ' || NEW.nombre || ' eliminado',
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
        ELSE
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
    END IF;

    RETURN NEW;
END;
$$;
