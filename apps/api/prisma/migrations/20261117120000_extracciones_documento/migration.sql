-- Lectura automática de documentos: precarga los datos del documento para
-- que el administrador revise más rápido. NO decide nada: el estado de una
-- credencial lo sigue cambiando solo un administrador (ver credenciales).

CREATE TYPE "tipo_documento_lectura" AS ENUM ('CEDULA', 'CERTIFICADO', 'CURSO');
CREATE TYPE "estado_extraccion" AS ENUM ('PENDIENTE', 'EXTRAIDA', 'FALLIDA');
CREATE TYPE "resultado_revision_campo" AS ENUM ('ACEPTADO', 'CORREGIDO');

-- Una extracción por documento (el id del documento es el de su credencial).
--
-- Vive mientras vive el documento: CASCADE desde la credencial, y además la
-- API la borra en la misma transacción en que se resuelve la solicitud y se
-- elimina el archivo. Así el RUT leído de una cédula no queda guardado en
-- otra tabla después de borrar el documento.
CREATE TABLE "extracciones_documento" (
    "id" TEXT NOT NULL,
    "credencial_id" TEXT NOT NULL,
    "tipo" "tipo_documento_lectura" NOT NULL,
    "estado" "estado_extraccion" NOT NULL DEFAULT 'PENDIENTE',
    -- [{ "campo": "rut", "valor": "12.345.678-5", "confianza": 0.93 }, …]
    "campos" JSONB,
    "modelo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    -- Motivo corto del último fallo. Nunca el contenido del documento.
    "error" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraida_en" TIMESTAMP(3),

    CONSTRAINT "extracciones_documento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "extracciones_documento_credencial_id_key" ON "extracciones_documento"("credencial_id");
CREATE INDEX "extracciones_documento_estado_creado_en_idx" ON "extracciones_documento"("estado", "creado_en");

ALTER TABLE "extracciones_documento"
  ADD CONSTRAINT "extracciones_documento_credencial_id_fkey"
  FOREIGN KEY ("credencial_id") REFERENCES "credenciales"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Solo una extracción completa tiene campos, modelo y fecha; las demás, no.
ALTER TABLE "extracciones_documento" ADD CONSTRAINT "extracciones_documento_completa" CHECK (
  ("estado" = 'EXTRAIDA') = ("campos" IS NOT NULL)
  AND ("estado" = 'EXTRAIDA') = ("modelo" IS NOT NULL)
  AND ("estado" = 'EXTRAIDA') = ("extraida_en" IS NOT NULL)
);

-- MINIMIZACIÓN, impuesta por la base: de una cédula solo se guardan el
-- nombre y el RUT. Ni domicilio, ni fecha de nacimiento, ni nacionalidad,
-- ni número de documento, aunque el modelo los devolviera y el código
-- fallara en descartarlos.
ALTER TABLE "extracciones_documento" ADD CONSTRAINT "extracciones_documento_cedula_minima" CHECK (
  "tipo" <> 'CEDULA'
  OR "campos" IS NULL
  OR NOT jsonb_path_exists("campos", '$[*] ? (@.campo != "nombre" && @.campo != "rut")')
);

-- Qué tan precisa fue la lectura: por cada campo que revisó un
-- administrador, si lo aceptó tal cual o lo corrigió.
--
-- SIN valores y SIN vínculo con la credencial ni con la persona: guarda el
-- tipo de documento, el nombre del campo, la confianza que declaró el
-- modelo y el resultado. Por eso puede conservarse después de borrar el
-- documento y su extracción: no contiene ningún dato personal. `lote`
-- agrupa los campos de un mismo documento (un identificador al azar).
CREATE TABLE "revisiones_extraccion" (
    "id" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "tipo_documento" "tipo_documento_lectura" NOT NULL,
    "campo" TEXT NOT NULL,
    "confianza" DOUBLE PRECISION NOT NULL,
    "resultado" "resultado_revision_campo" NOT NULL,
    "modelo" TEXT NOT NULL,
    -- Cómo terminó la solicitud: VERIFICADA o RECHAZADA.
    "decision" "estado_credencial" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisiones_extraccion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revisiones_extraccion_tipo_documento_campo_idx" ON "revisiones_extraccion"("tipo_documento", "campo");

ALTER TABLE "revisiones_extraccion" ADD CONSTRAINT "revisiones_extraccion_confianza_0_a_1"
  CHECK ("confianza" >= 0 AND "confianza" <= 1);

-- Es evidencia: solo admite inserciones (el mismo trigger que las bitácoras).
CREATE TRIGGER "revisiones_extraccion_solo_insercion"
  BEFORE UPDATE OR DELETE ON "revisiones_extraccion"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion_bitacora"();
