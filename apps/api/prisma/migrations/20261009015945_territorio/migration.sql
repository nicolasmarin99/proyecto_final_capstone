-- CreateTable
CREATE TABLE "regiones" (
    "id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunas" (
    "id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "region_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfiles_prestador" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "descripcion" TEXT,
    "telefono" TEXT,
    "comuna_id" INTEGER NOT NULL,
    "ubicacion" geography(Point,4326),
    "radio_atencion_km" INTEGER NOT NULL DEFAULT 10,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfiles_prestador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regiones_nombre_key" ON "regiones"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "regiones_orden_key" ON "regiones"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "comunas_region_id_nombre_key" ON "comunas"("region_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_prestador_usuario_id_key" ON "perfiles_prestador"("usuario_id");

-- CreateIndex
CREATE INDEX "perfiles_prestador_comuna_id_idx" ON "perfiles_prestador"("comuna_id");

-- CreateIndex
CREATE INDEX "perfiles_prestador_ubicacion_idx" ON "perfiles_prestador" USING GIST ("ubicacion");

-- AddForeignKey
ALTER TABLE "comunas" ADD CONSTRAINT "comunas_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_prestador" ADD CONSTRAINT "perfiles_prestador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_prestador" ADD CONSTRAINT "perfiles_prestador_comuna_id_fkey" FOREIGN KEY ("comuna_id") REFERENCES "comunas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── SQL manual: reglas que Prisma no expresa ──────────────────────────────
-- Prisma no gestiona CHECK: no los crea ni los borra en migraciones futuras,
-- así que viven solo aquí. Los nombres son explícitos para que el error que
-- llega a la API diga qué regla se violó.

-- Teléfono normalizado a E.164 chileno: +56 seguido de 9 dígitos
-- (móviles +569..., fijos +562...). La normalización la hace el código; la
-- base garantiza que nada mal formado llegue a guardarse.
ALTER TABLE "perfiles_prestador"
  ADD CONSTRAINT "perfiles_prestador_telefono_e164"
  CHECK ("telefono" IS NULL OR "telefono" ~ '^\+56[0-9]{9}$');

-- Radio de atención razonable para la Región Metropolitana y alrededores.
ALTER TABLE "perfiles_prestador"
  ADD CONSTRAINT "perfiles_prestador_radio_rango"
  CHECK ("radio_atencion_km" BETWEEN 1 AND 200);
