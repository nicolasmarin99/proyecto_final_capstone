-- Valoraciones por servicio: cada valoración califica UN servicio, el que
-- el cliente contactó, y no al prestador en general.
--
-- - Cada valoración existente hereda el servicio de su contacto.
-- - Si alguna valoración tiene un contacto SIN servicio (hecho desde el
--   perfil), la migración se detiene sin cambiar nada: no se inventa a qué
--   servicio corresponde. Hay que resolverla a mano antes de reintentar.
-- - Una clave foránea compuesta obliga a que el servicio de la valoración
--   sea exactamente el de su contacto.
-- - Una valoración por cliente y servicio (antes: por cliente y prestador).

-- 1. Guarda: ninguna valoración puede quedar sin servicio.
DO $$
DECLARE
  sin_servicio integer;
BEGIN
  SELECT count(*) INTO sin_servicio
    FROM "valoraciones" v
    JOIN "contactos" c ON c."id" = v."contacto_id"
   WHERE c."servicio_id" IS NULL;

  IF sin_servicio > 0 THEN
    RAISE EXCEPTION 'Hay % valoración(es) cuyo contacto no tiene servicio. Asígnales un servicio (o resuélvelas) antes de aplicar esta migración.', sin_servicio;
  END IF;
END $$;

-- 2. La columna, con el servicio del contacto. El trigger de contenido
--    inmutable todavía no la vigila, así que este UPDATE pasa.
ALTER TABLE "valoraciones" ADD COLUMN "servicio_id" TEXT;

UPDATE "valoraciones" v
   SET "servicio_id" = c."servicio_id"
  FROM "contactos" c
 WHERE c."id" = v."contacto_id";

ALTER TABLE "valoraciones" ALTER COLUMN "servicio_id" SET NOT NULL;

-- 3. La valoración apunta a su contacto CON el servicio: (contacto, cliente,
--    prestador, servicio) tiene que existir tal cual en contactos.
ALTER TABLE "valoraciones" DROP CONSTRAINT "valoraciones_contacto_id_cliente_id_prestador_id_fkey";
DROP INDEX "contactos_id_cliente_id_prestador_id_key";
CREATE UNIQUE INDEX "contactos_id_cliente_id_prestador_id_servicio_id_key"
  ON "contactos"("id", "cliente_id", "prestador_id", "servicio_id");

ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_contacto_id_cliente_id_prestador_id_servicio_id_fkey"
  FOREIGN KEY ("contacto_id", "cliente_id", "prestador_id", "servicio_id")
  REFERENCES "contactos"("id", "cliente_id", "prestador_id", "servicio_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Y el servicio es de ese mismo prestador (servicios tiene UNIQUE (id, prestador_id)).
ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_servicio_id_prestador_id_fkey"
  FOREIGN KEY ("servicio_id", "prestador_id")
  REFERENCES "servicios"("id", "prestador_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 4. Una por cliente y servicio.
DROP INDEX "valoraciones_cliente_id_prestador_id_key";
CREATE UNIQUE INDEX "valoraciones_cliente_id_servicio_id_key" ON "valoraciones"("cliente_id", "servicio_id");
CREATE INDEX "valoraciones_servicio_id_estado_idx" ON "valoraciones"("servicio_id", "estado");

-- 5. El servicio también es parte del contenido inmutable: una valoración
--    publicada no se mueve a otro servicio.
CREATE OR REPLACE FUNCTION "rechazar_cambio_contenido_valoracion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."calificacion" IS DISTINCT FROM OLD."calificacion"
    OR NEW."comentario" IS DISTINCT FROM OLD."comentario"
    OR NEW."editada_en" IS DISTINCT FROM OLD."editada_en"
    OR NEW."contacto_id" IS DISTINCT FROM OLD."contacto_id"
    OR NEW."cliente_id" IS DISTINCT FROM OLD."cliente_id"
    OR NEW."prestador_id" IS DISTINCT FROM OLD."prestador_id"
    OR NEW."servicio_id" IS DISTINCT FROM OLD."servicio_id"
    OR NEW."creado_en" IS DISTINCT FROM OLD."creado_en"
  THEN
    RAISE EXCEPTION 'valoraciones_contenido_inmutable: una valoración publicada no se puede editar'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
