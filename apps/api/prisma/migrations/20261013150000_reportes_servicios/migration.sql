-- Reportes de servicios.
--
-- La tabla denuncias ya modela «una denuncia apunta a exactamente un objeto»
-- (CHECK denuncias_exactamente_un_objeto): se reutiliza tal cual para los
-- reportes de servicios. Esta migración le agrega lo que faltaba y crea la
-- bitácora de decisiones.
--
-- Los reportes NUNCA ocultan un servicio por sí solos: ninguna regla de esta
-- migración cambia el estado de un servicio. Solo una fila de
-- decisiones_reporte, escrita por un administrador, lo hace.

-- ─── 0. Guarda ────────────────────────────────────────────────────────────

-- Se cambian los valores del motivo. Ninguna versión publicada de la app creó
-- denuncias, así que la tabla debería estar vacía; si no lo está, se detiene
-- en vez de convertir motivos viejos a ciegas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "denuncias") THEN
    RAISE EXCEPTION 'denuncias tiene filas: revisa cómo convertir sus motivos antes de aplicar esta migración';
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "accion_reporte" AS ENUM ('DESESTIMAR', 'OCULTAR_SERVICIO');

-- AlterEnum
ALTER TYPE "estado_denuncia" ADD VALUE 'RETIRADA';

-- AlterEnum
BEGIN;
CREATE TYPE "motivo_denuncia_new" AS ENUM ('CONTENIDO_ENGANOSO', 'IMAGENES_INAPROPIADAS', 'DATOS_DE_CONTACTO_EN_LA_DESCRIPCION', 'SERVICIO_ILEGAL_O_PELIGROSO', 'SUPLANTACION_DE_IDENTIDAD', 'OTRO');
ALTER TABLE "denuncias" ALTER COLUMN "motivo" TYPE "motivo_denuncia_new" USING ("motivo"::text::"motivo_denuncia_new");
ALTER TYPE "motivo_denuncia" RENAME TO "motivo_denuncia_old";
ALTER TYPE "motivo_denuncia_new" RENAME TO "motivo_denuncia";
DROP TYPE "public"."motivo_denuncia_old";
COMMIT;

-- DropIndex
DROP INDEX "denuncias_denunciante_id_idx";

-- DropIndex
DROP INDEX "denuncias_servicio_id_idx";

-- CreateTable
CREATE TABLE "decisiones_reporte" (
    "id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "accion" "accion_reporte" NOT NULL,
    "motivo" TEXT NOT NULL,
    "reportes_cerrados" INTEGER NOT NULL,
    "administrador_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisiones_reporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisiones_reporte_servicio_id_creado_en_idx" ON "decisiones_reporte"("servicio_id", "creado_en");

-- CreateIndex
CREATE INDEX "decisiones_reporte_administrador_id_creado_en_idx" ON "decisiones_reporte"("administrador_id", "creado_en");

-- CreateIndex
CREATE INDEX "denuncias_denunciante_id_creado_en_idx" ON "denuncias"("denunciante_id", "creado_en");

-- CreateIndex
CREATE INDEX "denuncias_servicio_id_estado_idx" ON "denuncias"("servicio_id", "estado");

-- AddForeignKey
ALTER TABLE "decisiones_reporte" ADD CONSTRAINT "decisiones_reporte_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Reglas que Prisma no expresa ─────────────────────────────────────────

-- Una sola denuncia ABIERTA por persona y servicio. Parcial a propósito:
-- - las retiradas no cuentan (quien retiró puede volver a reportar);
-- - las ya decididas tampoco: si el servicio cambia después de una
--   desestimación, se puede reportar de nuevo, como un caso nuevo.
-- Solo aplica a denuncias de servicios (servicio_id no nulo).
CREATE UNIQUE INDEX "denuncias_una_abierta_por_persona_y_servicio"
  ON "denuncias" ("denunciante_id", "servicio_id")
  WHERE "servicio_id" IS NOT NULL AND "estado" IN ('ABIERTA', 'EN_REVISION');

-- Con motivo OTRO hay que explicar cuál: un «otro» sin texto no se puede revisar.
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_otro_con_detalle"
  CHECK ("motivo" <> 'OTRO' OR coalesce(btrim("detalle"), '') <> '');

-- Toda decisión explica por qué.
ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_motivo_no_vacio" CHECK (btrim("motivo") <> '');

ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_cerrados_no_negativo" CHECK ("reportes_cerrados" >= 0);

-- Solo inserción: la misma función que eventos_credencial, accesos_documento
-- y moderaciones_imagen. Una bitácora de decisiones que se puede editar no
-- prueba nada.
CREATE TRIGGER "decisiones_reporte_solo_insercion"
  BEFORE UPDATE OR DELETE ON "decisiones_reporte"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion_bitacora"();
