-- Fotos de perfil para cualquier cuenta, con reportes y decisiones en la
-- misma bitácora que los servicios y las valoraciones.

-- ─── 1. Las fotos ──────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "estado_foto_perfil" AS ENUM ('VIGENTE', 'ELIMINADA', 'RETIRADA');

-- CreateTable
CREATE TABLE "fotos_perfil" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "estado" "estado_foto_perfil" NOT NULL DEFAULT 'VIGENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin_en" TIMESTAMP(3),

    CONSTRAINT "fotos_perfil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fotos_perfil_identificador_key" ON "fotos_perfil"("identificador");

-- CreateIndex
CREATE INDEX "fotos_perfil_usuario_id_creado_en_idx" ON "fotos_perfil"("usuario_id", "creado_en");

-- AddForeignKey: RESTRICT, como denuncias: la fila de una foto es evidencia
-- de la moderación y no se va en cascada.
ALTER TABLE "fotos_perfil" ADD CONSTRAINT "fotos_perfil_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una sola foto vigente por cuenta. Las eliminadas y retiradas no cuentan.
CREATE UNIQUE INDEX "fotos_perfil_una_vigente_por_usuario"
  ON "fotos_perfil" ("usuario_id")
  WHERE "estado" = 'VIGENTE';

-- Una vigente todavía se muestra (sin fin); las demás dicen cuándo dejaron
-- de mostrarse.
ALTER TABLE "fotos_perfil"
  ADD CONSTRAINT "fotos_perfil_fin_segun_estado"
  CHECK (("estado" = 'VIGENTE') = ("fin_en" IS NULL));

-- ─── 2. Reportes sobre una foto ───────────────────────────────────────────

-- AlterTable
ALTER TABLE "denuncias" ADD COLUMN "foto_perfil_id" TEXT;

-- CreateIndex
CREATE INDEX "denuncias_foto_perfil_id_estado_idx" ON "denuncias"("foto_perfil_id", "estado");

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_foto_perfil_id_fkey" FOREIGN KEY ("foto_perfil_id") REFERENCES "fotos_perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ahora son cuatro objetos posibles; sigue habiendo exactamente uno.
ALTER TABLE "denuncias" DROP CONSTRAINT "denuncias_exactamente_un_objeto";
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_exactamente_un_objeto"
  CHECK (num_nonnulls("valoracion_id", "servicio_id", "usuario_denunciado_id", "foto_perfil_id") = 1);

-- Cada motivo con su objeto. Una foto se reporta por ser inapropiada, por
-- suplantar a alguien o por exponer datos personales (u OTRO, con
-- comentario). Las dos primeras condiciones son las de antes, sin cambios.
ALTER TABLE "denuncias" DROP CONSTRAINT "denuncias_motivo_segun_objeto";
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_motivo_segun_objeto" CHECK (
    ("valoracion_id" IS NULL OR "motivo"::text IN
      ('LENGUAJE_OFENSIVO', 'INFORMACION_FALSA', 'DATOS_PERSONALES_EXPUESTOS', 'NO_CORRESPONDE_A_UN_SERVICIO', 'OTRO'))
    AND
    ("servicio_id" IS NULL OR "motivo"::text NOT IN
      ('LENGUAJE_OFENSIVO', 'INFORMACION_FALSA', 'DATOS_PERSONALES_EXPUESTOS', 'NO_CORRESPONDE_A_UN_SERVICIO'))
    AND
    ("foto_perfil_id" IS NULL OR "motivo"::text IN
      ('IMAGENES_INAPROPIADAS', 'SUPLANTACION_DE_IDENTIDAD', 'DATOS_PERSONALES_EXPUESTOS', 'OTRO'))
  );

-- Un solo reporte abierto por persona y foto (como con los servicios): un
-- segundo envío no suma una persona más.
CREATE UNIQUE INDEX "denuncias_una_abierta_por_persona_y_foto"
  ON "denuncias" ("denunciante_id", "foto_perfil_id")
  WHERE "foto_perfil_id" IS NOT NULL AND "estado" IN ('ABIERTA', 'EN_REVISION');

-- ─── 3. Decisiones sobre fotos en la misma bitácora ───────────────────────

-- AlterEnum
ALTER TYPE "accion_reporte" ADD VALUE 'RETIRAR_FOTO_PERFIL';

-- AlterTable. ALTER TABLE no dispara el trigger de solo inserción.
ALTER TABLE "decisiones_reporte" ADD COLUMN "foto_perfil_id" TEXT;

-- CreateIndex
CREATE INDEX "decisiones_reporte_foto_perfil_id_creado_en_idx" ON "decisiones_reporte"("foto_perfil_id", "creado_en");

-- AddForeignKey
ALTER TABLE "decisiones_reporte" ADD CONSTRAINT "decisiones_reporte_foto_perfil_id_fkey" FOREIGN KEY ("foto_perfil_id") REFERENCES "fotos_perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "decisiones_reporte" DROP CONSTRAINT "decisiones_reporte_exactamente_un_objeto";
ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_exactamente_un_objeto"
  CHECK (num_nonnulls("servicio_id", "valoracion_id", "foto_perfil_id") = 1);

-- Cada acción con su objeto. Se compara como texto: el valor recién agregado
-- al enum no se puede usar como literal en la misma transacción.
ALTER TABLE "decisiones_reporte" DROP CONSTRAINT "decisiones_reporte_accion_segun_objeto";
ALTER TABLE "decisiones_reporte"
  ADD CONSTRAINT "decisiones_reporte_accion_segun_objeto" CHECK (
    ("accion"::text <> 'OCULTAR_SERVICIO' OR "servicio_id" IS NOT NULL)
    AND ("accion"::text <> 'OCULTAR_VALORACION' OR "valoracion_id" IS NOT NULL)
    AND ("accion"::text <> 'RETIRAR_FOTO_PERFIL' OR "foto_perfil_id" IS NOT NULL)
  );
