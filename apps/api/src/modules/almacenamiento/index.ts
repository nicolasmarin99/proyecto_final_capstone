import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../../env.js";
import { AlmacenamientoCloudinary } from "./almacenamiento.cloudinary.js";
import { AlmacenamientoEnMemoria } from "./almacenamiento.memoria.js";
import { AlmacenamientoPublicoCloudinary } from "./almacenamiento.publico.cloudinary.js";
import { AlmacenamientoPublicoEnDisco } from "./almacenamiento.publico.disco.js";
import { AlmacenamientoPublicoEnMemoria } from "./almacenamiento.publico.memoria.js";
import type { AlmacenamientoPublico } from "./almacenamiento.publico.tipos.js";
import type { AlmacenamientoDocumentos } from "./almacenamiento.tipos.js";

export type { AlmacenamientoDocumentos, ArchivoAGuardar, TipoDocumento } from "./almacenamiento.tipos.js";
export { DocumentoNoEncontrado } from "./almacenamiento.tipos.js";
export { AlmacenamientoEnMemoria } from "./almacenamiento.memoria.js";
export type { AlmacenamientoPublico, ImagenAGuardar, TipoImagen, VarianteImagen } from "./almacenamiento.publico.tipos.js";
export { TIPO_MIME_IMAGEN } from "./almacenamiento.publico.tipos.js";
export { AlmacenamientoPublicoEnMemoria } from "./almacenamiento.publico.memoria.js";
export { AlmacenamientoPublicoEnDisco } from "./almacenamiento.publico.disco.js";

/** Las mismas credenciales sirven a los dos adaptadores de Cloudinary. */
function configurarCloudinary() {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

let instancia: AlmacenamientoDocumentos | null = null;

/** El mapa obliga a cubrir cada valor del enum de env.ts, como en el correo. */
const TRANSPORTES: Record<typeof env.ALMACENAMIENTO_TRANSPORTE, () => AlmacenamientoDocumentos> = {
  memoria: () => new AlmacenamientoEnMemoria(),
  produccion: () => new AlmacenamientoCloudinary(configurarCloudinary(), env.CLOUDINARY_CARPETA_IDENTIDADES),
};

/**
 * Única puerta al almacenamiento. Una sola instancia: en memoria, porque si
 * cada llamada creara la suya los archivos se perderían entre peticiones.
 */
export function obtenerAlmacenamiento(): AlmacenamientoDocumentos {
  instancia ??= TRANSPORTES[env.ALMACENAMIENTO_TRANSPORTE]();

  return instancia;
}

// ─── Imágenes públicas ─────────────────────────────────────────────────────

/** Raíz de apps/api, tanto desde src/ como desde dist/. */
const RAIZ_API = fileURLToPath(new URL("../../../", import.meta.url));

type TransportePublico = "memoria" | "disco" | "produccion";

/**
 * Sin valor explícito, sigue al almacenamiento de documentos: si este es de
 * producción, las fotos también van a Cloudinary. Así un despliegue que ya
 * usa Cloudinary no puede quedar guardando fotos en el disco efímero.
 */
function transportePublico(): TransportePublico {
  return env.ALMACENAMIENTO_PUBLICO_TRANSPORTE ?? (env.ALMACENAMIENTO_TRANSPORTE === "produccion" ? "produccion" : "disco");
}

const TRANSPORTES_PUBLICOS: Record<TransportePublico, () => AlmacenamientoPublico> = {
  memoria: () => new AlmacenamientoPublicoEnMemoria(),
  disco: () => new AlmacenamientoPublicoEnDisco(path.resolve(RAIZ_API, env.ALMACENAMIENTO_PUBLICO_CARPETA_LOCAL)),
  produccion: () => new AlmacenamientoPublicoCloudinary(configurarCloudinary(), env.CLOUDINARY_CARPETA_SERVICIOS),
};

let instanciaPublica: AlmacenamientoPublico | null = null;

/** Única puerta al almacenamiento de imágenes públicas. */
export function obtenerAlmacenamientoPublico(): AlmacenamientoPublico {
  instanciaPublica ??= TRANSPORTES_PUBLICOS[transportePublico()]();

  return instanciaPublica;
}
