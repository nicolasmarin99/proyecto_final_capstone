-- ─── SQL manual: configuración de búsqueda en español sin tildes ──────────
-- La columna generada de servicios exige una expresión inmutable. Llamar a
-- unaccent() dentro de la expresión no sirve: la función es STABLE, no
-- IMMUTABLE. En cambio, una configuración de búsqueda que usa unaccent como
-- diccionario sí deja la expresión inmutable, porque to_tsvector con una
-- configuración fija lo es.
--
-- Copia la configuración "spanish" y antepone unaccent al stemmer: primero
-- quita tildes, después reduce la palabra a su raíz. Así "gasfitería",
-- "gasfiteria" y "GASFITERÍA" quedan indexadas igual.
CREATE TEXT SEARCH CONFIGURATION "espanol_sin_tildes" (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION "espanol_sin_tildes"
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;

-- CreateEnum
CREATE TYPE "unidad_precio" AS ENUM ('POR_SERVICIO', 'POR_HORA', 'POR_DIA', 'POR_METRO_CUADRADO', 'POR_PERSONA');

-- CreateEnum
CREATE TYPE "estado_servicio" AS ENUM ('BORRADOR', 'PUBLICADO', 'PAUSADO', 'OCULTO');

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" TEXT NOT NULL,
    "prestador_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precio_desde" INTEGER,
    "precio_hasta" INTEGER,
    "unidad_precio" "unidad_precio",
    "estado" "estado_servicio" NOT NULL DEFAULT 'BORRADOR',
    -- Generada y almacenada: se recalcula sola al cambiar título o
    -- descripción, así que nunca queda desactualizada. El título pesa más
    -- (A) que la descripción (B) al ordenar por relevancia.
    "busqueda" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('espanol_sin_tildes'::regconfig, coalesce("titulo", '')), 'A') ||
        setweight(to_tsvector('espanol_sin_tildes'::regconfig, coalesce("descripcion", '')), 'B')
    ) STORED,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE INDEX "servicios_prestador_id_idx" ON "servicios"("prestador_id");

-- CreateIndex
CREATE INDEX "servicios_categoria_id_estado_idx" ON "servicios"("categoria_id", "estado");

-- CreateIndex
CREATE INDEX "servicios_busqueda_idx" ON "servicios" USING GIN ("busqueda");

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "perfiles_prestador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── SQL manual: reglas que Prisma no expresa ──────────────────────────────

-- Título con contenido real (mismo rango que valida la API con Zod).
ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_titulo_largo"
  CHECK (char_length(btrim("titulo")) BETWEEN 5 AND 120);

-- Precios en pesos: no negativos, y el rango no puede estar invertido.
ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_precios_no_negativos"
  CHECK ("precio_desde" IS NULL OR "precio_desde" >= 0);

ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_rango_precio"
  CHECK ("precio_hasta" IS NULL OR ("precio_desde" IS NOT NULL AND "precio_hasta" >= "precio_desde"));

-- Si hay precio tiene que decir por qué se cobra; sin precio es "a convenir".
ALTER TABLE "servicios"
  ADD CONSTRAINT "servicios_unidad_si_hay_precio"
  CHECK ("precio_desde" IS NULL OR "unidad_precio" IS NOT NULL);
