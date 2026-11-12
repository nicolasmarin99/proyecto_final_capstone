-- Valoraciones definitivas: una vez publicada, nadie cambia lo que dice.
--
-- La API ya no ofrece editar ni retirar. Esto lo garantiza además la base:
-- un UPDATE que toque la calificación, el comentario, la marca de edición
-- o a quién pertenece la valoración se rechaza, venga de donde venga.
--
-- Lo único que sigue cambiando es el estado (la moderación: PUBLICADA →
-- OCULTA, decisión del administrador) y actualizado_en, que lo acompaña.
--
-- editada_en se conserva: las valoraciones editadas antes de esta regla
-- siguen mostrando «Editada» con su fecha. Desde ahora siempre queda nula
-- en las nuevas, y el trigger impide marcarla.
--
-- No se bloquea DELETE con trigger: la API no tiene ninguna ruta que borre
-- valoraciones, y las claves foráneas RESTRICT de denuncias y decisiones
-- ya impiden borrar una con moderación.

CREATE FUNCTION "rechazar_cambio_contenido_valoracion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."calificacion" IS DISTINCT FROM OLD."calificacion"
    OR NEW."comentario" IS DISTINCT FROM OLD."comentario"
    OR NEW."editada_en" IS DISTINCT FROM OLD."editada_en"
    OR NEW."contacto_id" IS DISTINCT FROM OLD."contacto_id"
    OR NEW."cliente_id" IS DISTINCT FROM OLD."cliente_id"
    OR NEW."prestador_id" IS DISTINCT FROM OLD."prestador_id"
    OR NEW."creado_en" IS DISTINCT FROM OLD."creado_en"
  THEN
    RAISE EXCEPTION 'valoraciones_contenido_inmutable: una valoración publicada no se puede editar'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "valoraciones_contenido_inmutable"
  BEFORE UPDATE ON "valoraciones"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_cambio_contenido_valoracion"();
