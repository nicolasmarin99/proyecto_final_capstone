import type { TipoDocumento } from "../almacenamiento/index.js";
import { ArchivoMalFormado, esJpg, esPng, quitarMetadatosJpg, quitarMetadatosPng } from "../../shared/metadatos.js";

/** El mismo error que la limpieza compartida; se conserva el nombre que ya usaba este módulo. */
export { ArchivoMalFormado as DocumentoMalFormado };

/*
  Validación y limpieza del documento de identidad, antes de que salga del
  servidor.

  El tipo se decide por los primeros bytes ("número mágico") y nunca por el
  nombre del archivo ni por el Content-Type que manda el navegador: los dos
  los escribe el cliente, y renombrar un .html a .jpg no lo convierte en
  imagen.

  Los metadatos se quitan acá y no en el proveedor de almacenamiento. Una foto
  de la cédula tomada con el celular trae en su EXIF el modelo del teléfono, la
  fecha y, muchas veces, las coordenadas GPS de la casa de la persona. Nada de
  eso hace falta para verificar una identidad, así que no se guarda en ningún
  lado (minimización de datos), sea cual sea el adaptador.
*/

const FIRMA_PDF = Buffer.from("%PDF-", "latin1");

export function detectarTipo(bytes: Buffer): TipoDocumento | null {
  // Solo JPG, PNG y PDF: un WEBP no se acepta como documento de identidad.
  if (esJpg(bytes)) {
    return "jpg";
  }

  if (esPng(bytes)) {
    return "png";
  }

  if (bytes.subarray(0, FIRMA_PDF.length).equals(FIRMA_PDF)) {
    return "pdf";
  }

  return null;
}

/**
 * Devuelve una copia del archivo sin metadatos. Si la estructura no
 * corresponde a su firma, lanza DocumentoMalFormado: es preferible rechazar
 * un archivo raro a guardarlo sin haberlo podido limpiar.
 *
 * Los PDF no tienen EXIF y se dejan igual. Pueden traer autor en su
 * diccionario de información; quitarlo exigiría reescribir el PDF con una
 * librería. Se acepta porque el administrador nunca abre el PDF (ve una
 * imagen generada a partir de él) y el archivo se borra al terminar la
 * revisión.
 */
export function quitarMetadatos(bytes: Buffer, tipo: TipoDocumento): Buffer {
  if (tipo === "jpg") return quitarMetadatosJpg(bytes);
  if (tipo === "png") return quitarMetadatosPng(bytes);
  return bytes;
}
