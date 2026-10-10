-- CreateTable
CREATE TABLE "accesos_documento" (
    "id" TEXT NOT NULL,
    "credencial_id" TEXT NOT NULL,
    "administrador_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accesos_documento_credencial_id_creado_en_idx" ON "accesos_documento"("credencial_id", "creado_en");

-- CreateIndex
CREATE INDEX "accesos_documento_administrador_id_creado_en_idx" ON "accesos_documento"("administrador_id", "creado_en");

-- AddForeignKey
ALTER TABLE "accesos_documento" ADD CONSTRAINT "accesos_documento_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "credenciales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_documento" ADD CONSTRAINT "accesos_documento_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── SQL manual: solo inserción ────────────────────────────────────────────
-- Reutiliza la función de la migración de credenciales, que rechaza UPDATE y
-- DELETE fila a fila. Una bitácora de accesos que se puede editar no prueba
-- nada: quien miró un documento podría borrar el rastro.
CREATE TRIGGER "accesos_documento_solo_insercion"
  BEFORE UPDATE OR DELETE ON "accesos_documento"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion_bitacora"();
