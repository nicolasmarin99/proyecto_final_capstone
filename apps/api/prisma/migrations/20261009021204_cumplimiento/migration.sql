-- CreateEnum
CREATE TYPE "motivo_denuncia" AS ENUM ('CONTENIDO_OFENSIVO', 'INFORMACION_FALSA', 'FRAUDE', 'SPAM', 'OTRO');

-- CreateEnum
CREATE TYPE "estado_denuncia" AS ENUM ('ABIERTA', 'EN_REVISION', 'RESUELTA', 'DESESTIMADA');

-- CreateEnum
CREATE TYPE "tipo_evento_seguridad" AS ENUM ('INICIO_SESION', 'INICIO_SESION_FALLIDO', 'CIERRE_SESION', 'REUTILIZACION_TOKEN_REFRESCO', 'CORREO_VERIFICADO', 'RECUPERACION_SOLICITADA', 'CONTRASENA_RESTABLECIDA', 'CONTRASENA_CAMBIADA', 'ACCESO_DENEGADO', 'CUENTA_ANONIMIZADA');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "anonimizado_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "denuncias" (
    "id" TEXT NOT NULL,
    "denunciante_id" TEXT NOT NULL,
    "motivo" "motivo_denuncia" NOT NULL,
    "detalle" TEXT,
    "estado" "estado_denuncia" NOT NULL DEFAULT 'ABIERTA',
    "valoracion_id" TEXT,
    "servicio_id" TEXT,
    "usuario_denunciado_id" TEXT,
    "resolucion" TEXT,
    "resuelta_por_id" TEXT,
    "resuelta_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "denuncias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versiones_terminos" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versiones_terminos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceptaciones_terminos" (
    "usuario_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "aceptada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceptaciones_terminos_pkey" PRIMARY KEY ("usuario_id","version_id")
);

-- CreateTable
CREATE TABLE "eventos_seguridad" (
    "id" TEXT NOT NULL,
    "tipo" "tipo_evento_seguridad" NOT NULL,
    "usuario_id" TEXT,
    "agente_usuario" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "denuncias_estado_creado_en_idx" ON "denuncias"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "denuncias_denunciante_id_idx" ON "denuncias"("denunciante_id");

-- CreateIndex
CREATE INDEX "denuncias_valoracion_id_idx" ON "denuncias"("valoracion_id");

-- CreateIndex
CREATE INDEX "denuncias_servicio_id_idx" ON "denuncias"("servicio_id");

-- CreateIndex
CREATE INDEX "denuncias_usuario_denunciado_id_idx" ON "denuncias"("usuario_denunciado_id");

-- CreateIndex
CREATE UNIQUE INDEX "versiones_terminos_version_key" ON "versiones_terminos"("version");

-- CreateIndex
CREATE INDEX "aceptaciones_terminos_version_id_idx" ON "aceptaciones_terminos"("version_id");

-- CreateIndex
CREATE INDEX "eventos_seguridad_usuario_id_creado_en_idx" ON "eventos_seguridad"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "eventos_seguridad_tipo_creado_en_idx" ON "eventos_seguridad"("tipo", "creado_en");

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_denunciante_id_fkey" FOREIGN KEY ("denunciante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_valoracion_id_fkey" FOREIGN KEY ("valoracion_id") REFERENCES "valoraciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_usuario_denunciado_id_fkey" FOREIGN KEY ("usuario_denunciado_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptaciones_terminos" ADD CONSTRAINT "aceptaciones_terminos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptaciones_terminos" ADD CONSTRAINT "aceptaciones_terminos_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versiones_terminos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_seguridad" ADD CONSTRAINT "eventos_seguridad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ─── SQL manual: reglas que Prisma no expresa ──────────────────────────────

-- Una denuncia apunta a exactamente un objeto: ni cero, ni dos, ni tres.
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_exactamente_un_objeto"
  CHECK (num_nonnulls("valoracion_id", "servicio_id", "usuario_denunciado_id") = 1);

-- Nadie se denuncia a sí mismo.
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_no_a_si_mismo"
  CHECK ("usuario_denunciado_id" IS NULL OR "usuario_denunciado_id" <> "denunciante_id");

-- Una denuncia cerrada (resuelta o desestimada) dice qué se decidió, quién
-- lo decidió y cuándo. Una abierta todavía no tiene nada de eso.
ALTER TABLE "denuncias"
  ADD CONSTRAINT "denuncias_resolucion_completa"
  CHECK (
    CASE
      WHEN "estado" IN ('RESUELTA', 'DESESTIMADA') THEN
        coalesce(btrim("resolucion"), '') <> ''
        AND "resuelta_por_id" IS NOT NULL
        AND "resuelta_en" IS NOT NULL
      ELSE
        "resolucion" IS NULL AND "resuelta_por_id" IS NULL AND "resuelta_en" IS NULL
    END
  );

-- Anonimización: una cuenta marcada como anonimizada no puede conservar
-- ningún dato que identifique a la persona. El correo se reemplaza por uno
-- en el dominio reservado .invalid (RFC 2606): único por cuenta, porque la
-- columna es UNIQUE, e imposible de entregar.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_anonimizado_sin_datos_personales"
  CHECK (
    "anonimizado_en" IS NULL
    OR (
      "correo" LIKE 'anonimo+%@localcl.invalid'
      AND "nombre" = 'Usuario eliminado'
      AND "hash_contrasena" IS NULL
      AND "rut" IS NULL
      AND "activo" = false
    )
  );

-- El agente de usuario es texto que manda el navegador: se acota para que
-- nadie use la bitácora como almacenamiento.
ALTER TABLE "eventos_seguridad"
  ADD CONSTRAINT "eventos_seguridad_agente_largo"
  CHECK ("agente_usuario" IS NULL OR char_length("agente_usuario") <= 512);
