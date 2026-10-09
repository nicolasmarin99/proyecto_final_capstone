-- CreateEnum
CREATE TYPE "canal_contacto" AS ENUM ('WHATSAPP', 'TELEFONO', 'CORREO', 'FORMULARIO');

-- CreateEnum
CREATE TYPE "estado_valoracion" AS ENUM ('PUBLICADA', 'OCULTA');

-- CreateTable
CREATE TABLE "contactos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "prestador_id" TEXT NOT NULL,
    "servicio_id" TEXT,
    "canal" "canal_contacto" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valoraciones" (
    "id" TEXT NOT NULL,
    "contacto_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "prestador_id" TEXT NOT NULL,
    "calificacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "estado" "estado_valoracion" NOT NULL DEFAULT 'PUBLICADA',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "valoraciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuestas_valoracion" (
    "id" TEXT NOT NULL,
    "valoracion_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "respuestas_valoracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contactos_cliente_id_idx" ON "contactos"("cliente_id");

-- CreateIndex
CREATE INDEX "contactos_prestador_id_idx" ON "contactos"("prestador_id");

-- CreateIndex
CREATE INDEX "contactos_servicio_id_idx" ON "contactos"("servicio_id");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_id_cliente_id_prestador_id_key" ON "contactos"("id", "cliente_id", "prestador_id");

-- CreateIndex
CREATE UNIQUE INDEX "valoraciones_contacto_id_key" ON "valoraciones"("contacto_id");

-- CreateIndex
CREATE INDEX "valoraciones_prestador_id_estado_idx" ON "valoraciones"("prestador_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "valoraciones_cliente_id_prestador_id_key" ON "valoraciones"("cliente_id", "prestador_id");

-- CreateIndex
CREATE UNIQUE INDEX "respuestas_valoracion_valoracion_id_key" ON "respuestas_valoracion"("valoracion_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_id_prestador_id_key" ON "servicios"("id", "prestador_id");

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "perfiles_prestador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_servicio_id_prestador_id_fkey" FOREIGN KEY ("servicio_id", "prestador_id") REFERENCES "servicios"("id", "prestador_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoraciones" ADD CONSTRAINT "valoraciones_contacto_id_cliente_id_prestador_id_fkey" FOREIGN KEY ("contacto_id", "cliente_id", "prestador_id") REFERENCES "contactos"("id", "cliente_id", "prestador_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_valoracion" ADD CONSTRAINT "respuestas_valoracion_valoracion_id_fkey" FOREIGN KEY ("valoracion_id") REFERENCES "valoraciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─── SQL manual: reglas que Prisma no expresa ──────────────────────────────

-- Calificación de 1 a 5 estrellas.
ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_calificacion_1_a_5"
  CHECK ("calificacion" BETWEEN 1 AND 5);

-- Comentario opcional, pero si viene no puede ser solo espacios ni un texto
-- sin límite.
ALTER TABLE "valoraciones"
  ADD CONSTRAINT "valoraciones_comentario_largo"
  CHECK ("comentario" IS NULL OR char_length(btrim("comentario")) BETWEEN 1 AND 2000);

ALTER TABLE "respuestas_valoracion"
  ADD CONSTRAINT "respuestas_valoracion_texto_largo"
  CHECK (char_length(btrim("texto")) BETWEEN 1 AND 2000);
