import type { UploadApiOptions, UploadApiResponse } from "cloudinary";
import type { AlmacenamientoDocumentos, ArchivoAGuardar, TipoDocumento } from "./almacenamiento.tipos.js";

const TIPO_MIME: Record<TipoDocumento, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

/**
 * Parte del SDK de Cloudinary que usa este adaptador. Se declara aparte para
 * poder probar el adaptador con un doble que registra las llamadas, sin red:
 * así se verifica que siempre pida recursos privados y URLs que vencen.
 *
 * Los métodos usan la sintaxis de método (no propiedades con flecha) para que
 * el objeto real del SDK, con sus sobrecargas, siga siendo compatible.
 */
export interface ClienteCloudinary {
  uploader: {
    upload(archivo: string, opciones: UploadApiOptions): Promise<UploadApiResponse>;
    destroy(
      publicId: string,
      opciones: { resource_type: "image"; type: "private"; invalidate: boolean },
    ): Promise<unknown>;
  };
  utils: {
    private_download_url(
      publicId: string,
      formato: string,
      opciones: { resource_type: "image"; type: "private"; expires_at: number; attachment: boolean },
    ): string;
  };
}

/**
 * Documentos en Cloudinary como recursos PRIVADOS.
 *
 * - type "private": la URL pública normal de Cloudinary no los entrega. Solo
 *   se pueden obtener con una URL de descarga firmada con el secreto de la API.
 * - resource_type "image" también para los PDF: Cloudinary los trata como
 *   imágenes de varias páginas, y eso es lo que permite rasterizarlos.
 * - El nombre es el id que generó el servidor. use_filename y
 *   unique_filename en false: el nombre del archivo original nunca llega a
 *   Cloudinary.
 * - asset_folder: la cuenta usa carpetas dinámicas, así que la carpeta es un
 *   atributo aparte y no parte del public_id.
 *
 * Los metadatos (EXIF de la cámara, coordenadas GPS) ya vienen quitados: lo
 * hace identidad.documento.ts antes de que el archivo salga del servidor, así
 * que no dependemos de lo que haga el proveedor.
 */
export class AlmacenamientoCloudinary implements AlmacenamientoDocumentos {
  constructor(
    private readonly cliente: ClienteCloudinary,
    private readonly carpeta: string,
  ) {}

  async guardar({ id, contenido, tipo }: ArchivoAGuardar): Promise<void> {
    await this.cliente.uploader.upload(`data:${TIPO_MIME[tipo]};base64,${contenido.toString("base64")}`, {
      resource_type: "image",
      type: "private",
      public_id: id,
      asset_folder: this.carpeta,
      use_filename: false,
      unique_filename: false,
      // Un id repetido sería un error del servidor, no algo que corregir
      // pisando un documento ajeno.
      overwrite: false,
    });
  }

  /**
   * URL de descarga firmada que vence en `duracionSegundos`.
   *
   * Se pide en formato "jpg": Cloudinary genera una imagen a partir del
   * archivo (la primera página si es PDF) en vez de entregar el original. El
   * administrador ve el documento, pero nunca abre el archivo que subió el
   * prestador, que podría traer contenido activo.
   */
  async urlFirmada(id: string, duracionSegundos: number): Promise<string> {
    return this.cliente.utils.private_download_url(id, "jpg", {
      resource_type: "image",
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + duracionSegundos,
      // Que el navegador lo muestre en vez de descargarlo.
      attachment: false,
    });
  }

  /**
   * invalidate: true también lo saca de la caché de la CDN. Si Cloudinary
   * responde "not found", el archivo ya no estaba: es el resultado buscado.
   */
  async eliminar(id: string): Promise<void> {
    const respuesta = await this.cliente.uploader.destroy(id, {
      resource_type: "image",
      type: "private",
      invalidate: true,
    });
    const resultado =
      typeof respuesta === "object" && respuesta !== null && "result" in respuesta ? respuesta.result : undefined;

    if (resultado !== "ok" && resultado !== "not found") {
      // Sin incluir la respuesta completa en el mensaje: podría traer datos
      // de la cuenta. El id basta para reintentar.
      throw new Error(`Cloudinary no confirmó la eliminación del documento ${id}.`);
    }
  }
}
