import type { UploadApiOptions, UploadApiResponse, UrlOptions } from "cloudinary";
import {
  TIPO_MIME_IMAGEN,
  type AlmacenamientoPublico,
  type ImagenAGuardar,
  type VarianteImagen,
} from "./almacenamiento.publico.tipos.js";

/**
 * Parte del SDK de Cloudinary que usa este adaptador, declarada aparte para
 * probarlo con un doble sin red (igual que el de documentos).
 */
export interface ClienteCloudinaryPublico {
  uploader: {
    upload(archivo: string, opciones: UploadApiOptions): Promise<UploadApiResponse>;
    destroy(
      publicId: string,
      opciones: { resource_type: "image"; type: "upload"; invalidate: boolean },
    ): Promise<unknown>;
  };
  url(publicId: string, opciones: UrlOptions): string;
}

/**
 * Transformaciones de entrega. f_auto y q_auto: Cloudinary elige el formato
 * y la calidad según el navegador (WEBP o AVIF donde se pueda). La completa
 * se limita a 1600 px de ancho; la miniatura se recorta a 4:3 centrada en lo
 * importante de la foto (g_auto), para que todas las tarjetas midan igual.
 */
const TRANSFORMACIONES: Record<VarianteImagen, UrlOptions["transformation"]> = {
  completa: [{ width: 1600, crop: "limit" }, { fetch_format: "auto", quality: "auto" }],
  miniatura: [{ width: 640, height: 480, crop: "fill", gravity: "auto" }, { fetch_format: "auto", quality: "auto" }],
};

/**
 * Fotos de servicios en Cloudinary como recursos PÚBLICOS (type "upload").
 *
 * Es deliberadamente distinto del adaptador de documentos de identidad:
 * - type "upload" en vez de "private": la URL pública las entrega.
 * - Su propia carpeta (CLOUDINARY_CARPETA_SERVICIOS), separada de la de
 *   identidades, para que nunca se mezclen ni se auditen juntas.
 * - El nombre es el id que generó el servidor; el del archivo original
 *   nunca llega a Cloudinary.
 *
 * Los metadatos (EXIF, GPS) ya vienen quitados por el servidor.
 */
export class AlmacenamientoPublicoCloudinary implements AlmacenamientoPublico {
  constructor(
    private readonly cliente: ClienteCloudinaryPublico,
    private readonly carpeta: string,
  ) {}

  async guardar({ id, contenido, tipo }: ImagenAGuardar): Promise<void> {
    await this.cliente.uploader.upload(`data:${TIPO_MIME_IMAGEN[tipo]};base64,${contenido.toString("base64")}`, {
      resource_type: "image",
      type: "upload",
      public_id: id,
      asset_folder: this.carpeta,
      use_filename: false,
      unique_filename: false,
      overwrite: false,
    });
  }

  url(id: string, variante: VarianteImagen): string {
    return this.cliente.url(id, {
      secure: true,
      resource_type: "image",
      type: "upload",
      transformation: TRANSFORMACIONES[variante],
    });
  }

  /** invalidate: true también la saca de la caché de la CDN. */
  async eliminar(id: string): Promise<void> {
    const respuesta = await this.cliente.uploader.destroy(id, { resource_type: "image", type: "upload", invalidate: true });
    const resultado =
      typeof respuesta === "object" && respuesta !== null && "result" in respuesta ? respuesta.result : undefined;

    if (resultado !== "ok" && resultado !== "not found") {
      throw new Error(`Cloudinary no confirmó la eliminación de la imagen ${id}.`);
    }
  }
}
