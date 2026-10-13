-- CreateEnum
CREATE TYPE "estado_imagen" AS ENUM ('VISIBLE', 'OCULTA');

-- CreateTable
CREATE TABLE "imagenes_servicio" (
    "id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "estado_imagen" NOT NULL DEFAULT 'VISIBLE',
    "motivo_ocultamiento" TEXT,
    "ocultada_por_id" TEXT,
    "ocultada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagenes_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imagenes_servicio_identificador_key" ON "imagenes_servicio"("identificador");

-- CreateIndex
CREATE INDEX "imagenes_servicio_servicio_id_orden_idx" ON "imagenes_servicio"("servicio_id", "orden");

-- AddForeignKey
ALTER TABLE "imagenes_servicio" ADD CONSTRAINT "imagenes_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagenes_servicio" ADD CONSTRAINT "imagenes_servicio_ocultada_por_id_fkey" FOREIGN KEY ("ocultada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Reglas que Prisma no expresa ─────────────────────────────────────────

-- La posición en la galería parte en 0. El máximo de 5 imágenes por
-- servicio lo impone la API (un CHECK no puede contar filas).
ALTER TABLE "imagenes_servicio"
  ADD CONSTRAINT "imagenes_servicio_orden_no_negativo" CHECK ("orden" >= 0);

-- Ocultar es una decisión de moderación y deja rastro: con la imagen OCULTA
-- deben estar el motivo (no en blanco), el administrador y la fecha; con la
-- imagen VISIBLE, ninguno de los tres.
ALTER TABLE "imagenes_servicio"
  ADD CONSTRAINT "imagenes_servicio_ocultamiento_trazable" CHECK (
    ("estado" = 'VISIBLE'
       AND "motivo_ocultamiento" IS NULL
       AND "ocultada_por_id" IS NULL
       AND "ocultada_en" IS NULL)
    OR
    ("estado" = 'OCULTA'
       AND coalesce(btrim("motivo_ocultamiento"), '') <> ''
       AND "ocultada_por_id" IS NOT NULL
       AND "ocultada_en" IS NOT NULL)
  );
