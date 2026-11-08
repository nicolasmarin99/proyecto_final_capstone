-- Cursos del prestador.
--
-- Un curso es una credencial más, del tipo CURSO del catálogo: pasa por la
-- misma revisión del administrador y su documento se borra al decidir. Usa
-- nombre_personalizado (el curso) y emisor_personalizado (la institución),
-- y suma lo que una certificación no tiene: cuándo se terminó y cuántas
-- horas duró. No vence, así que vigente_hasta queda nulo.

-- ─── 1. El folio pasa a ser opcional ──────────────────────────────────────

-- Muchos cursos no traen número. Para la cédula y las certificaciones sigue
-- siendo obligatorio: lo exige la API, que conoce el tipo (un CHECK no puede
-- mirar tipos_credencial). Si viene, no puede ser solo espacios.
ALTER TABLE "credenciales" ALTER COLUMN "identificador_documento" DROP NOT NULL;

ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_identificador_no_vacio" CHECK (
    "identificador_documento" IS NULL OR char_length(btrim("identificador_documento")) >= 1
  );

-- ─── 2. Fecha de término y horas ──────────────────────────────────────────

-- AlterTable
ALTER TABLE "credenciales" ADD COLUMN     "fecha_termino" DATE,
ADD COLUMN     "horas" INTEGER;

-- Horas: opcionales, pero si van, un número razonable.
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_horas_rango" CHECK ("horas" IS NULL OR "horas" BETWEEN 1 AND 5000);

-- Fecha y horas son datos de un curso, y un curso siempre tiene nombre propio.
ALTER TABLE "credenciales"
  ADD CONSTRAINT "credenciales_curso_con_nombre" CHECK (
    ("fecha_termino" IS NULL AND "horas" IS NULL) OR "nombre_personalizado" IS NOT NULL
  );
