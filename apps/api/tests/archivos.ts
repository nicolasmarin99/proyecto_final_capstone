/**
 * Archivos mínimos para las pruebas, armados byte a byte. No son imágenes
 * que un visor pueda mostrar, pero tienen la estructura real de cada formato
 * (firma, segmentos o fragmentos), que es lo que revisa el servidor.
 */

/** Segmento JPEG: marcador FFxx + largo de 2 bytes (incluye los 2 del largo) + datos. */
function segmentoJpg(marcador: number, datos: Buffer): Buffer {
  const largo = Buffer.alloc(2);
  largo.writeUInt16BE(datos.length + 2);
  return Buffer.concat([Buffer.from([0xff, marcador]), largo, datos]);
}

/** JPG con APP0 (JFIF), APP1 (EXIF con "GPS"), un comentario y los datos de la imagen. */
export function jpgConExif(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmentoJpg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    segmentoJpg(0xe1, Buffer.from("Exif\0\0Canon EOS GPS-SECRETO -33.4378,-70.6505", "latin1")),
    segmentoJpg(0xfe, Buffer.from("comentario con GPS-SECRETO", "latin1")),
    segmentoJpg(0xdb, Buffer.alloc(65, 1)),
    // Start of Scan: desde acá van los datos comprimidos hasta el final.
    segmentoJpg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from("DATOS-DE-IMAGEN", "latin1"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** Fragmento PNG: largo de 4 bytes + tipo + datos + CRC (en cero: el servidor no lo revisa). */
function fragmentoPng(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  return Buffer.concat([largo, Buffer.from(tipo, "latin1"), datos, Buffer.alloc(4)]);
}

/** PNG con IHDR, un tEXt con el autor, un tIME, un IDAT y IEND. */
export function pngConTexto(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    fragmentoPng("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    fragmentoPng("tEXt", Buffer.from("Author\0Autor: Persona Real", "latin1")),
    fragmentoPng("tIME", Buffer.from([0x07, 0xea, 10, 10, 12, 0, 0])),
    fragmentoPng("IDAT", Buffer.from("datos-comprimidos", "latin1")),
    fragmentoPng("IEND", Buffer.alloc(0)),
  ]);
}

export function pdfMinimo(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
}
