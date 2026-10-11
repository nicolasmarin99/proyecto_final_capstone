-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "categoria_personalizada" TEXT;



-- ─── SQL manual: regla que Prisma no expresa ───────────────────────────────
-- Si viene, tiene contenido real y un largo razonable para un nombre de
-- oficio ("Pintura de interiores", no un párrafo). Que solo exista cuando la
-- categoría es «Otros» lo impone la API: un CHECK no puede consultar otra tabla.
ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_categoria_personalizada_largo"
  CHECK ("categoria_personalizada" IS NULL OR char_length(btrim("categoria_personalizada")) BETWEEN 3 AND 60);
