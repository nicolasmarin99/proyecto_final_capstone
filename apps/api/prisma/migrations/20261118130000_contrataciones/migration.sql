-- Registro PRIVADO de los servicios que un cliente contrató. Solo lo lee su
-- dueño; el prestador no lo ve ni sabe cuántos lo marcaron.

-- CreateTable
CREATE TABLE "contrataciones" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "servicio_id" TEXT,
    "prestador_id" TEXT,
    "fecha_contratacion" DATE NOT NULL,
    "titulo_servicio" TEXT NOT NULL,
    "nombre_prestador" TEXT NOT NULL,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrataciones_pkey" PRIMARY KEY ("id")
);

-- La lista del cliente, de la más reciente a la más antigua.
-- CreateIndex
CREATE INDEX "contrataciones_cliente_id_fecha_contratacion_idx" ON "contrataciones"("cliente_id", "fecha_contratacion" DESC);

-- CreateIndex
CREATE INDEX "contrataciones_servicio_id_idx" ON "contrataciones"("servicio_id");

-- CreateIndex
CREATE INDEX "contrataciones_prestador_id_idx" ON "contrataciones"("prestador_id");

-- El mismo servicio puede registrarse varias veces (un servicio recurrente),
-- pero no dos veces el mismo día: eso es un doble envío. Con el servicio ya
-- borrado (NULL) no aplica, porque un UNIQUE no compara nulos.
-- CreateIndex
CREATE UNIQUE INDEX "contrataciones_cliente_id_servicio_id_fecha_contratacion_key" ON "contrataciones"("cliente_id", "servicio_id", "fecha_contratacion");

-- CASCADE: si se borra la cuenta del cliente, su historial personal se va con ella.
-- AddForeignKey
ALTER TABLE "contrataciones" ADD CONSTRAINT "contrataciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: si se borra la publicación o la cuenta del prestador, el registro
-- sobrevive con el título y el nombre copiados.
-- AddForeignKey
ALTER TABLE "contrataciones" ADD CONSTRAINT "contrataciones_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrataciones" ADD CONSTRAINT "contrataciones_prestador_id_fkey" FOREIGN KEY ("prestador_id") REFERENCES "perfiles_prestador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Reglas que la base impone aunque la API fallara ────────────────────

-- La fecha no puede ser futura. «Hoy» es hoy en Chile: con CURRENT_DATE
-- (UTC en el servidor) se aceptaría «mañana» entre las 21:00 y la medianoche
-- de Santiago. La API revisa lo mismo con la misma zona horaria.
-- Se evalúa al insertar y al actualizar; una fecha pasada nunca deja de serlo.
ALTER TABLE "contrataciones"
  ADD CONSTRAINT "contrataciones_fecha_no_futura"
  CHECK ("fecha_contratacion" <= (now() AT TIME ZONE 'America/Santiago')::date);

-- Ataja años mal tipeados (0202 en vez de 2022).
ALTER TABLE "contrataciones"
  ADD CONSTRAINT "contrataciones_fecha_minima"
  CHECK ("fecha_contratacion" >= DATE '2000-01-01');

ALTER TABLE "contrataciones"
  ADD CONSTRAINT "contrataciones_notas_largo"
  CHECK ("notas" IS NULL OR char_length("notas") BETWEEN 1 AND 500);

-- Las copias son lo único que queda si el servicio se borra: no pueden faltar.
ALTER TABLE "contrataciones"
  ADD CONSTRAINT "contrataciones_copias_no_vacias"
  CHECK (char_length(btrim("titulo_servicio")) > 0 AND char_length(btrim("nombre_prestador")) > 0);
