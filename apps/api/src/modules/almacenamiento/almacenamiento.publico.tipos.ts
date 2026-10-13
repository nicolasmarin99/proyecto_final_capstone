/** Formatos de imagen pública, detectados por los bytes del archivo y nunca por su nombre. */
export type TipoImagen = "jpg" | "png" | "webp";

export interface ImagenAGuardar {
  /** Identificador generado por el servidor. El nombre original no se conserva. */
  id: string;
  contenido: Buffer;
  tipo: TipoImagen;
}

/** «completa» para la galería; «miniatura», recortada y liviana, para las tarjetas. */
export type VarianteImagen = "completa" | "miniatura";

export const TIPO_MIME_IMAGEN: Record<TipoImagen, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Puerto de salida para imágenes PÚBLICAS: las fotos de trabajos de un
 * servicio. Es otro puerto que AlmacenamientoDocumentos a propósito: allá
 * todo es privado y se borra tras la revisión; acá todo es público y
 * permanente. Mezclarlos invitaría a que un día un documento se guarde con
 * la configuración de una foto.
 *
 * Contrato que toda implementación debe cumplir:
 * - guardar() deja la imagen PÚBLICA, en un lugar separado de los documentos
 *   de identidad.
 * - url() arma la dirección pública sin consultar al proveedor: se llama una
 *   vez por imagen en cada página de resultados.
 * - eliminar() es idempotente: borrar algo que ya no está no es un error.
 */
export interface AlmacenamientoPublico {
  guardar(imagen: ImagenAGuardar): Promise<void>;
  url(id: string, variante: VarianteImagen): string;
  eliminar(id: string): Promise<void>;
}
