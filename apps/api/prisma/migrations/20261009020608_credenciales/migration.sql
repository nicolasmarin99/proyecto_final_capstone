-- CreateEnum
CREATE TYPE "metodo_verificacion" AS ENUM ('AUTOMATICO', 'MANUAL');

-- CreateEnum
CREATE TYPE "estado_credencial" AS ENUM ('PENDIENTE', 'VERIFICADA', 'RECHAZADA', 'VENCIDA', 'REVOCADA');

-- CreateTable
CREATE TABLE "tipos_credencial" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fuente_oficial" TEXT NOT NULL,
    "metodo_verificacion" "metodo_verificacion" NOT NULL,
    "requiere_vigencia" BOOLEAN NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_credencial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciales" (
    "id" TEXT NOT NULL,
    "prestador_id" TEXT NOT NULL,
    "tipo_id" TEXT NOT NULL,
    "estado" "estado_credencial" NOT NULL DEFAULT 'PENDIENTE',
    "identificador_documento" TEXT NOT NULL,
    "vigente_hasta" DATE,
    "metodo" "metodo_verificacion",
    "fuente" TEXT,
    "fecha_consulta" TIMESTAMP(3),
    "verificado_por_id" TEXT,
    "motivo_rechazo" TEXT,
    "reemplaza_aid" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credenciales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_credencial" (
    "id" TEXT NOT NULL,
    "credencial_id" TEXT NOT NULL,
    "estado_anterior" "estado_credencial",
    "estado_nuevo" "estado_credencial" NOT NULL,
    "autor_id" TEXT,
    "motivo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_credencial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_credencial_codigo_key" ON "tipos_credencial"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_reemplaza_aid_key" ON "credenciales"("reemplaza_aid");

-- CreateIndex
CREATE INDEX "credenciales_prestador_id_estado_idx" ON "credenciales"("prestador_id", "estado");

-- CreateIndex
CREATE INDEX "credenciales_tipo_id_idx" ON "credenciales"("tipo_id");

-- CreateIndex
CREATE INDEX "credenciales_estado_vigente_hasta_idx" ON "credenciales"("estado", "vigente_hasta");

-- CreateIndex
CREATE INDEX "eventos_credencial_credencial_id_creado_en_idx" ON "eventos_credencial"("credencial_id", "creado_en");

-- AddForeignKey
ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "perfiles_prestador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_credencial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_verificado_por_id_fkey" FOREIGN KEY ("verificado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_reemplaza_aid_fkey" FOREIGN KEY ("reemplaza_aid") REFERENCES "credenciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_credencial" ADD CONSTRAINT "eventos_credencial_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "credenciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_credencial" ADD CONSTRAINT "eventos_credencial_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── SQL manual: reglas que Prisma no expresa ──────────────────────────────

-- Un prestador no puede tener dos credenciales verificadas del mismo tipo.
--
-- "vigente" no puede ir en el predicado: un índice parcial solo admite
-- expresiones inmutables, y now() no lo es (el resultado cambiaría con el
-- tiempo sin que cambien las filas). Por eso la vigencia se expresa en el
-- estado: un proceso del servidor pasa a VENCIDA las que superan
-- vigente_hasta. Así, VERIFICADA significa "verificada y vigente", y este
-- índice impone la regla completa.
--
-- Para renovar, la credencial nueva entra como PENDIENTE; al verificarla, la
-- anterior se pasa a VENCIDA o REVOCADA en la misma transacción.
CREATE UNIQUE INDEX "credenciales_una_verificada_por_tipo"
  ON "credenciales" ("prestador_id", "tipo_id")
  WHERE "estado" = 'VERIFICADA';

-- Un rechazo siempre explica por qué: la persona tiene que saber qué corregir.
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_rechazo_con_motivo"
  CHECK ("estado" <> 'RECHAZADA' OR coalesce(btrim("motivo_rechazo"), '') <> '');

-- Una verificación deja rastro de cómo y cuándo se hizo, y si fue manual,
-- de quién la hizo.
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_verificacion_trazable"
  CHECK (
    "estado" <> 'VERIFICADA'
    OR (
      "metodo" IS NOT NULL
      AND "fecha_consulta" IS NOT NULL
      AND ("metodo" = 'AUTOMATICO' OR "verificado_por_id" IS NOT NULL)
    )
  );

-- Una credencial no puede reemplazarse a sí misma.
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_no_se_reemplaza_a_si_misma"
  CHECK ("reemplaza_aid" IS NULL OR "reemplaza_aid" <> "id");

-- Un evento registra un cambio: el estado nuevo tiene que ser distinto.
ALTER TABLE "eventos_credencial"
  ADD CONSTRAINT "eventos_credencial_cambia_estado"
  CHECK ("estado_anterior" IS DISTINCT FROM "estado_nuevo");

-- Bitácora solo de inserción. Un REVOKE no basta: la aplicación se conecta
-- con un único usuario que también es dueño de las tablas. El trigger
-- rechaza UPDATE y DELETE fila a fila, venga de donde venga.
-- (TRUNCATE no dispara triggers de fila: queda como operación de
-- mantenimiento, que es lo que usan las pruebas para limpiar.)
--
-- Sin USING ERRCODE a propósito: el valor por defecto, P0001, llega a la
-- aplicación con este mensaje intacto. Un código de la clase 23 (p. ej.
-- restrict_violation) Prisma lo traduce como violación de clave foránea y
-- descarta el mensaje, lo que deja una pista falsa a quien lea el error.
CREATE FUNCTION "rechazar_modificacion_bitacora"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % solo admite inserciones', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "eventos_credencial_solo_insercion"
  BEFORE UPDATE OR DELETE ON "eventos_credencial"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion_bitacora"();
