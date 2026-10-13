import type { TipoImagen } from "../almacenamiento/index.js";
import { esJpg, esPng, esWebp, quitarMetadatosJpg, quitarMetadatosPng, quitarMetadatosWebp } from "../../shared/metadatos.js";

export { ArchivoMalFormado as ImagenMalFormada } from "../../shared/metadatos.js";

/*
  Validación y limpieza de una foto de servicio, antes de que salga del
  servidor. Es la misma lógica que los documentos de identidad (ver
  shared/metadatos.ts), con otro conjunto de formatos: acá se acepta WEBP
  y no PDF.

  El tipo se decide por los primeros bytes y nunca por el nombre ni por el
  Content-Type, que los escribe el cliente.

  Los metadatos importan todavía más que en la cédula: esta foto será
  pública, y la de un trabajo terminado suele tomarse en la casa de un
  cliente. Su EXIF puede traer las coordenadas de esa casa.
*/

export function detectarTipoImagen(bytes: Buffer): TipoImagen | null {
  if (esJpg(bytes)) return "jpg";
  if (esPng(bytes)) return "png";
  if (esWebp(bytes)) return "webp";
  return null;
}

/** Copia de la imagen sin metadatos. Lanza ImagenMalFormada si la estructura no calza con la firma. */
export function quitarMetadatosImagen(bytes: Buffer, tipo: TipoImagen): Buffer {
  if (tipo === "jpg") return quitarMetadatosJpg(bytes);
  if (tipo === "png") return quitarMetadatosPng(bytes);
  return quitarMetadatosWebp(bytes);
}
