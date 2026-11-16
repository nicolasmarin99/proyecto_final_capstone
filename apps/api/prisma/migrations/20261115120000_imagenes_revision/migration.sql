-- Revisión de imágenes: para que el panel de administración pueda decir
-- «este prestador tiene N imágenes por revisar».
--
-- Las fotos se siguen publicando al subirlas (no hay aprobación previa). Lo
-- nuevo es que cada foto queda SIN REVISAR hasta que un administrador la
-- oculta o la marca como revisada. «Por revisar» = visible y sin fecha de
-- revisión.
--
-- Las fotos que ya existen quedan sin revisar: nadie las ha mirado todavía,
-- y decir lo contrario sería falso. Las ocultas no cuentan como pendientes.
ALTER TABLE "imagenes_servicio"
  ADD COLUMN "revisada_en" TIMESTAMP(3),
  ADD COLUMN "revisada_por_id" TEXT;

-- Quién la revisó. RESTRICT, como en las bitácoras: una cuenta de
-- administración no se borra mientras tenga acciones registradas.
ALTER TABLE "imagenes_servicio"
  ADD CONSTRAINT "imagenes_servicio_revisada_por_id_fkey"
  FOREIGN KEY ("revisada_por_id") REFERENCES "usuarios"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los dos van juntos: una revisión sin autor (o un autor sin fecha) no dice nada.
ALTER TABLE "imagenes_servicio" ADD CONSTRAINT "imagenes_servicio_revision_completa" CHECK (
  ("revisada_en" IS NULL) = ("revisada_por_id" IS NULL)
);
