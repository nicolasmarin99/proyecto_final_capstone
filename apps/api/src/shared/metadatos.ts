/*
  Limpieza de metadatos de imágenes, compartida por los documentos de
  identidad y las fotos de los servicios.

  Una foto tomada con el celular trae en su EXIF el modelo del teléfono, la
  fecha y, muchas veces, las coordenadas GPS de donde se tomó: la casa de
  quien sube una cédula, o la de un cliente en la foto de un trabajo. Nada de
  eso hace falta, así que se quita en el servidor antes de que el archivo
  salga hacia el almacenamiento, sea cual sea el adaptador.

  Se recorre la estructura del formato y se copian solo los bloques que
  describen la imagen. Si la estructura no corresponde a su firma, se lanza
  ArchivoMalFormado: es preferible rechazar un archivo raro a guardarlo sin
  haberlo podido limpiar.
*/

export const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function esJpg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function esPng(bytes: Buffer): boolean {
  return bytes.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG);
}

/** WEBP: contenedor RIFF cuyo formato es "WEBP". */
export function esWebp(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
}

/** El archivo no tiene la estructura que dice su firma. */
export class ArchivoMalFormado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ArchivoMalFormado";
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

export function quitarMetadatosJpg(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, 2)];
  let posicion = 2;

  while (posicion < bytes.length) {
    if (bytes[posicion] !== 0xff || posicion + 1 >= bytes.length) {
      throw new ArchivoMalFormado("Segmento JPEG sin marcador.");
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
      throw new ArchivoMalFormado("Segmento JPEG truncado.");
    }

    const largo = bytes.readUInt16BE(posicion + 2);
    const fin = posicion + 2 + largo;

    if (largo < 2 || fin > bytes.length) {
      throw new ArchivoMalFormado("Segmento JPEG con un largo imposible.");
    }

    if (!seDescartaSegmentoJpg(marcador)) {
      partes.push(bytes.subarray(posicion, fin));
    }

    posicion = fin;
  }

  throw new ArchivoMalFormado("El JPEG no tiene datos de imagen.");
}

/** Fragmentos PNG de texto libre (autor, comentarios), EXIF y fecha de modificación. */
const FRAGMENTOS_PNG_DESCARTADOS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function quitarMetadatosPng(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, FIRMA_PNG.length)];
  let posicion = FIRMA_PNG.length;

  while (posicion + 8 <= bytes.length) {
    const largo = bytes.readUInt32BE(posicion);
    const tipo = bytes.toString("latin1", posicion + 4, posicion + 8);
    // Largo + tipo + datos + CRC.
    const fin = posicion + 12 + largo;

    if (fin > bytes.length) {
      throw new ArchivoMalFormado("Fragmento PNG truncado.");
    }

    if (!FRAGMENTOS_PNG_DESCARTADOS.has(tipo)) {
      partes.push(bytes.subarray(posicion, fin));
    }

    if (tipo === "IEND") {
      return Buffer.concat(partes);
    }

    posicion = fin;
  }

  throw new ArchivoMalFormado("El PNG no termina en IEND.");
}

/** Fragmentos RIFF de un WEBP que llevan metadatos: EXIF (cámara, GPS) y XMP. */
const FRAGMENTOS_WEBP_DESCARTADOS = new Set(["EXIF", "XMP "]);

/** Bits del encabezado VP8X que anuncian EXIF (0x08) y XMP (0x04). */
const BANDERAS_METADATOS_VP8X = 0x08 | 0x04;

/**
 * WEBP: «RIFF», largo (4 bytes, little endian), «WEBP» y después fragmentos
 * con tipo (4), largo (4) y datos, más un byte de relleno si el largo es
 * impar. Se descartan EXIF y XMP, y en VP8X se apagan los bits que los
 * anuncian, para que ningún visor busque lo que ya no está. Lo que venga
 * después del largo declarado se descarta: no es parte de la imagen.
 */
export function quitarMetadatosWebp(bytes: Buffer): Buffer {
  const declarado = bytes.readUInt32LE(4) + 8;

  if (declarado > bytes.length) {
    throw new ArchivoMalFormado("WEBP truncado.");
  }

  const partes: Buffer[] = [];
  let posicion = 12;

  while (posicion < declarado) {
    if (posicion + 8 > declarado) {
      throw new ArchivoMalFormado("Fragmento WEBP truncado.");
    }

    const tipo = bytes.toString("latin1", posicion, posicion + 4);
    const largo = bytes.readUInt32LE(posicion + 4);
    const fin = posicion + 8 + largo + (largo % 2);

    if (fin > declarado) {
      throw new ArchivoMalFormado("Fragmento WEBP con un largo imposible.");
    }

    if (tipo === "VP8X" && largo >= 1) {
      // Copia: el Buffer recibido no se modifica.
      const fragmento = Buffer.from(bytes.subarray(posicion, fin));
      fragmento[8] = (fragmento[8] ?? 0) & ~BANDERAS_METADATOS_VP8X;
      partes.push(fragmento);
    } else if (!FRAGMENTOS_WEBP_DESCARTADOS.has(tipo)) {
      partes.push(bytes.subarray(posicion, fin));
    }

    posicion = fin;
  }

  if (partes.length === 0) {
    throw new ArchivoMalFormado("El WEBP no tiene datos de imagen.");
  }

  const cuerpo = Buffer.concat(partes);
  const encabezado = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WEBP", "latin1")]);
  encabezado.writeUInt32LE(cuerpo.length + 4, 4);
  return Buffer.concat([encabezado, cuerpo]);
}
