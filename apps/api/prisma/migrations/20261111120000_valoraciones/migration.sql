-- Valoraciones de prestadores y objeciones.
--
-- Las tablas valoraciones, contactos y denuncias ya existen. Esta migración
-- agrega lo que falta para:
-- - marcar una valoración como editada, con su fecha;
-- - que el prestador OBJETE una valoración (una denuncia con valoracion_id),
--   con motivos propios;
-- - que la decisión del administrador quede en la misma bitácora de solo
--   inserción que los reportes de servicios.
--
-- REGLA CENTRAL: nada de esta migración deja que una valoración cambie de
-- estado sin una fila en decisiones_reporte escrita por un administrador.
-- El prestador objeta; no oculta ni borra.

-- ─── 0. Guarda ────────────────────────────────────────────────────────────

-- El comentario pasa de 1–2000 a 10–1000 caracteres. Ninguna versión de la
-- app creó valoraciones; si hay alguna fuera del nuevo rango, se detiene en
-- vez de recortar o borrar textos a ciegas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "valoraciones"
     WHERE "comentario" IS NOT NULL AND char_length(btrim("comentario")) NOT BETWEEN 10 AND 1000
  ) THEN
    RAISE EXCEPTION 'valoraciones tiene comentarios fuera de 10–1000 caracteres: revísalos antes de aplicar esta migración';
  END IF;
END
$$;

-- ─── 1. Valoración editada ────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "valoraciones" ADD COLUMN "editada_en" TIMESTAMP(3);

-- Una edición no puede ser anterior a la valoración.
ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_editada_despues" CHECK ("editada_en" IS NULL OR "editada_en" >= "creado_en");

-- Comentario opcional; si va, entre 10 y 1000 caracteres (el mismo límite
-- que valida la API con Zod).
ALTER TABLE "valoraciones" DROP CONSTRAINT "valoraciones_comentario_largo";
ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_comentario_largo"
  CHECK ("comentario" IS NULL OR char_length(btrim("comentario")) BETWEEN 10 AND 1000);

-- ─── 2. Motivos de objeción ───────────────────────────────────────────────

-- AlterEnum
ALTER TYPE "motivo_denuncia" ADD VALUE 'LENGUAJE_OFENSIVO';
ALTER TYPE "motivo_denuncia" ADD VALUE 'INFORMACION_FALSA';
ALTER TYPE "motivo_denuncia" ADD VALUE 'DATOS_PERSONALES_EXPUESTOS';
ALTER TYPE "motivo_denuncia" ADD VALUE 'NO_CORRESPONDE_A_UN_SERVICIO';

-- Cada motivo con su objeto: los de una valoración no sirven para un
-- servicio, ni al revés. OTRO vale para los dos. Se compara como texto: un
-- valor de enum recién agregado no se puede usar como literal en la misma
-- transacción.
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_motivo_segun_objeto" CHECK (
    ("valoracion_id" IS NULL OR "motivo"::text IN
      ('LENGUAJE_OFENSIVO', 'INFORMACION_FALSA', 'DATOS_PERSONALES_EXPUESTOS', 'NO_CORRESPONDE_A_UN_SERVICIO', 'OTRO'))
    AND
    ("servicio_id" IS NULL OR "motivo"::text NOT IN
      ('LENGUAJE_OFENSIVO', 'INFORMACION_FALSA', 'DATOS_PERSONALES_EXPUESTOS', 'NO_CORRESPONDE_A_UN_SERVICIO'))
  );

-- Una sola objeción por valoración, en cualquier estado: si se desestimó, no
-- se puede volver a objetar hasta cansar al administrador.
CREATE UNIQUE INDEX "denuncias_una_por_valoracion"
  ON "denuncias" ("valoracion_id")
  WHERE "valoracion_id" IS NOT NULL;

-- ─── 3. Decisiones sobre valoraciones en la misma bitácora ────────────────

-- AlterEnum
ALTER TYPE "accion_reporte" ADD VALUE 'OCULTAR_VALORACION';

-- AlterTable: una decisión es sobre un servicio O sobre una valoración.
-- Las filas existentes son todas de servicios y siguen válidas. ALTER TABLE
-- no dispara el trigger de solo inserción (es por fila, no de esquema).
ALTER TABLE "decisiones_reporte" ALTER COLUMN "servicio_id" DROP NOT NULL,
ADD COLUMN "valoracion_id" TEXT;

-- CreateIndex
CREATE INDEX "decisiones_reporte_valoracion_id_creado_en_idx" ON "decisiones_reporte"("valoracion_id", "creado_en");

-- AddForeignKey: RESTRICT, como denuncias: una valoración con decisiones no
-- se borra (la evidencia de la moderación se conserva).
ALTER TABLE "decisiones_reporte" ADD CONSTRAINT "decisiones_reporte_valoracion_id_fkey" FOREIGN KEY ("valoracion_id") REFERENCES "valoraciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_exactamente_un_objeto"
  CHECK (num_nonnulls("servicio_id", "valoracion_id") = 1);

-- Cada acción con su objeto: no se «oculta un servicio» con una decisión
-- sobre una valoración, ni al revés. Desestimar vale para los dos.
ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_accion_segun_objeto" CHECK (
    ("accion"::text <> 'OCULTAR_SERVICIO' OR "servicio_id" IS NOT NULL)
    AND ("accion"::text <> 'OCULTAR_VALORACION' OR "valoracion_id" IS NOT NULL)
  );
