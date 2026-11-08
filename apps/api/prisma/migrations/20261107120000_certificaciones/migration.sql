-- Certificaciones del prestador.
--
-- La tabla credenciales ya guarda lo necesario (tipo, número, vigencia,
-- estado, quién verificó). Esta migración le agrega el nombre y el emisor
-- libres para el tipo «Otra certificación», y ajusta las dos reglas de
-- unicidad para que un prestador pueda tener varias «Otra» distintas.

-- ─── 1. Nombre y emisor libres ────────────────────────────────────────────

-- AlterTable
ALTER TABLE "credenciales" ADD COLUMN     "emisor_personalizado" TEXT,
ADD COLUMN     "nombre_personalizado" TEXT;

-- Van los dos o ninguno, y si van, con un largo razonable. Que solo se usen
-- con el tipo OTRA lo impone la API (un CHECK no puede mirar tipos_credencial).
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_personalizada_completa" CHECK (
    ("nombre_personalizado" IS NULL AND "emisor_personalizado" IS NULL)
    OR (
      char_length(btrim("nombre_personalizado")) BETWEEN 3 AND 120
      AND char_length(btrim("emisor_personalizado")) BETWEEN 3 AND 120
    )
  );

-- ─── 2. Unicidad por certificación, no solo por tipo ──────────────────────

-- Antes: a lo más una VERIFICADA por (prestador, tipo). Con «Otra», el tipo
-- es el mismo para certificaciones distintas (un curso de altura y uno de
-- primeros auxilios), así que la clave suma el nombre. Para los tipos del
-- catálogo el nombre es nulo y la regla queda igual que antes.
DROP INDEX "credenciales_una_verificada_por_tipo";

CREATE UNIQUE INDEX "credenciales_una_verificada_por_tipo"
  ON "credenciales" ("prestador_id", "tipo_id", coalesce(lower(btrim("nombre_personalizado")), ''))
  WHERE "estado" = 'VERIFICADA';

-- Nuevo: a lo más una PENDIENTE por la misma certificación. Evita que la cola
-- del administrador se llene con envíos repetidos de lo mismo; para corregir
-- algo, se espera la revisión o se reemplaza después.
CREATE UNIQUE INDEX "credenciales_una_pendiente_por_tipo"
  ON "credenciales" ("prestador_id", "tipo_id", coalesce(lower(btrim("nombre_personalizado")), ''))
  WHERE "estado" = 'PENDIENTE';
