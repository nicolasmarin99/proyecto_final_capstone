-- Bitácora propia para la moderación de imágenes.
--
-- Hasta ahora quién, cuándo y por qué se ocultó una imagen vivía en la fila
-- de la imagen. Eso obligaba a impedir que el prestador borrara la imagen o
-- su servicio (se perdía la evidencia). Desde acá la evidencia vive en
-- moderaciones_imagen, independiente de la imagen: el prestador puede borrar
-- lo suyo y el registro se conserva.
--
-- Orden: primero la tabla nueva, después se copian las moderaciones que ya
-- existan y recién entonces se quitan las columnas viejas. Así ninguna
-- moderación registrada se pierde al aplicar esta migración.

-- ─── 1. Tabla nueva ───────────────────────────────────────────────────────

-- servicio_id, imagen_id e identificador_archivo van SIN clave foránea a
-- propósito: la evidencia tiene que sobrevivir a que se borren la imagen o el
-- servicio (ver el comentario del modelo en schema.prisma).
CREATE TABLE "moderaciones_imagen" (
    "id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "imagen_id" TEXT NOT NULL,
    "identificador_archivo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "administrador_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderaciones_imagen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderaciones_imagen_imagen_id_idx" ON "moderaciones_imagen"("imagen_id");

-- CreateIndex
CREATE INDEX "moderaciones_imagen_servicio_id_creado_en_idx" ON "moderaciones_imagen"("servicio_id", "creado_en");

-- CreateIndex
CREATE INDEX "moderaciones_imagen_administrador_id_creado_en_idx" ON "moderaciones_imagen"("administrador_id", "creado_en");

-- AddForeignKey
ALTER TABLE "moderaciones_imagen" ADD CONSTRAINT "moderaciones_imagen_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El motivo no puede quedar en blanco: una moderación sin razón no explica nada.
ALTER TABLE "moderaciones_imagen"
  ADD CONSTRAINT "moderaciones_imagen_motivo_no_vacio" CHECK (btrim("motivo") <> '');

-- ─── 2. Se trasladan las moderaciones existentes ──────────────────────────

-- El CHECK imagenes_servicio_ocultamiento_trazable garantiza que toda imagen
-- OCULTA tiene motivo, administrador y fecha: la copia es completa.
INSERT INTO "moderaciones_imagen"
  ("id", "servicio_id", "imagen_id", "identificador_archivo", "motivo", "administrador_id", "creado_en")
SELECT gen_random_uuid()::text, "servicio_id", "id", "identificador", "motivo_ocultamiento", "ocultada_por_id", "ocultada_en"
  FROM "imagenes_servicio"
 WHERE "estado" = 'OCULTA';

-- ─── 3. Se quitan las columnas viejas de la imagen ────────────────────────

ALTER TABLE "imagenes_servicio" DROP CONSTRAINT "imagenes_servicio_ocultamiento_trazable";

-- DropForeignKey
ALTER TABLE "imagenes_servicio" DROP CONSTRAINT "imagenes_servicio_ocultada_por_id_fkey";

-- AlterTable
ALTER TABLE "imagenes_servicio" DROP COLUMN "motivo_ocultamiento",
DROP COLUMN "ocultada_en",
DROP COLUMN "ocultada_por_id";

-- ─── 4. Solo inserción ────────────────────────────────────────────────────

-- La misma función que eventos_credencial y accesos_documento: rechaza UPDATE
-- y DELETE fila a fila. Una bitácora de moderación que se puede editar no
-- prueba nada.
CREATE TRIGGER "moderaciones_imagen_solo_insercion"
  BEFORE UPDATE OR DELETE ON "moderaciones_imagen"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion_bitacora"();
