import type { TipoDocumento } from "../almacenamiento/index.js";

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

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_PDF = Buffer.from("%PDF-", "latin1");

export function detectarTipo(bytes: Buffer): TipoDocumento | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }

  if (bytes.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) {
    return "png";
  }

  if (bytes.subarray(0, FIRMA_PDF.length).equals(FIRMA_PDF)) {
    return "pdf";
  }

  return null;
}

/** El archivo no tiene la estructura que dice su firma. */
export class DocumentoMalFormado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "DocumentoMalFormado";
  }
}

/**
 * Segmentos JPEG que se descartan:
 * - APP1 (0xE1): EXIF y XMP, donde van la cámara, la fecha y el GPS.
 * - APP3 a APP13 y APP15: datos de fabricantes y de Photoshop (IPTC: autor, lugar).
 * - COM (0xFE): comentarios de texto libre.
 *
 * Se conservan APP0 (JFIF), APP2 (perfil de color ICC) y APP14 (Adobe): sin
 * ellos algunas imágenes se verían con colores equivocados, y no identifican
 * a nadie.
 */
function seDescartaSegmentoJpg(marcador: number): boolean {
  return marcador === 0xe1 || (marcador >= 0xe3 && marcador <= 0xed) || marcador === 0xef || marcador === 0xfe;
}

function quitarMetadatosJpg(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, 2)];
  let posicion = 2;

  while (posicion < bytes.length) {
    if (bytes[posicion] !== 0xff || posicion + 1 >= bytes.length) {
      throw new DocumentoMalFormado("Segmento JPEG sin marcador.");
    }

    const marcador = bytes[posicion + 1] ?? 0;

    // Start of Scan: lo que sigue son los datos comprimidos de la imagen,
    // hasta el final. No hay más metadatos que revisar.
    if (marcador === 0xda) {
      partes.push(bytes.subarray(posicion));
      return Buffer.concat(partes);
    }

    // Marcadores sin largo (relleno, reinicio, fin de imagen).
    if (marcador === 0xff || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      partes.push(bytes.subarray(posicion, posicion + 2));
      posicion += 2;
      continue;
    }

    if (posicion + 4 > bytes.length) {
      throw new DocumentoMalFormado("Segmento JPEG truncado.");
    }

    const largo = bytes.readUInt16BE(posicion + 2);
    const fin = posicion + 2 + largo;

    if (largo < 2 || fin > bytes.length) {
      throw new DocumentoMalFormado("Segmento JPEG con un largo imposible.");
    }

    if (!seDescartaSegmentoJpg(marcador)) {
      partes.push(bytes.subarray(posicion, fin));
    }

    posicion = fin;
  }

  throw new DocumentoMalFormado("El JPEG no tiene datos de imagen.");
}

/** Fragmentos PNG de texto libre (autor, comentarios), EXIF y fecha de modificación. */
const FRAGMENTOS_PNG_DESCARTADOS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function quitarMetadatosPng(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, FIRMA_PNG.length)];
  let posicion = FIRMA_PNG.length;

  while (posicion + 8 <= bytes.length) {
    const largo = bytes.readUInt32BE(posicion);
    const tipo = bytes.toString("latin1", posicion + 4, posicion + 8);
    // Largo + tipo + datos + CRC.
    const fin = posicion + 12 + largo;

    if (fin > bytes.length) {
      throw new DocumentoMalFormado("Fragmento PNG truncado.");
    }

    if (!FRAGMENTOS_PNG_DESCARTADOS.has(tipo)) {
      partes.push(bytes.subarray(posicion, fin));
    }

    if (tipo === "IEND") {
      return Buffer.concat(partes);
    }

    posicion = fin;
  }

  throw new DocumentoMalFormado("El PNG no termina en IEND.");
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
