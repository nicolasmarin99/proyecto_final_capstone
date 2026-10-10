import { v2 as cloudinary } from "cloudinary";
import { env } from "../../env.js";
import { AlmacenamientoCloudinary } from "./almacenamiento.cloudinary.js";
import { AlmacenamientoEnMemoria } from "./almacenamiento.memoria.js";
import type { AlmacenamientoDocumentos } from "./almacenamiento.tipos.js";

export type { AlmacenamientoDocumentos, ArchivoAGuardar, TipoDocumento } from "./almacenamiento.tipos.js";
export { DocumentoNoEncontrado } from "./almacenamiento.tipos.js";
export { AlmacenamientoEnMemoria } from "./almacenamiento.memoria.js";

let instancia: AlmacenamientoDocumentos | null = null;

/** El mapa obliga a cubrir cada valor del enum de env.ts, como en el correo. */
const TRANSPORTES: Record<typeof env.ALMACENAMIENTO_TRANSPORTE, () => AlmacenamientoDocumentos> = {
  memoria: () => new AlmacenamientoEnMemoria(),
  produccion: () => {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    return new AlmacenamientoCloudinary(cloudinary, env.CLOUDINARY_CARPETA_IDENTIDADES);
  },
};

/**
 * Única puerta al almacenamiento. Una sola instancia: en memoria, porque si
 * cada llamada creara la suya los archivos se perderían entre peticiones.
 */
export function obtenerAlmacenamiento(): AlmacenamientoDocumentos {
  instancia ??= TRANSPORTES[env.ALMACENAMIENTO_TRANSPORTE]();

  return instancia;
}
