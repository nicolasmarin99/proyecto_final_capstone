/** Formatos aceptados, detectados por los bytes del archivo y nunca por su nombre. */
export type TipoDocumento = "jpg" | "png" | "pdf";

export interface ArchivoAGuardar {
  /** Identificador generado por el servidor. El nombre original no se conserva. */
  id: string;
  contenido: Buffer;
  tipo: TipoDocumento;
}

/**
 * Puerto de salida para guardar documentos sensibles.
 *
 * Igual que con el correo, el resto de la aplicación depende de esta
 * interfaz y no de un proveedor: las pruebas usan un doble en memoria que no
 * toca la red, y cambiar de proveedor es cambiar un archivo.
 *
 * Contrato que toda implementación debe cumplir:
 * - guardar() deja el archivo PRIVADO: nadie puede abrirlo sin una URL firmada.
 * - urlFirmada() entrega una versión rasterizada (una imagen generada a partir
 *   del archivo), nunca el original, y que deja de servir pasada `duracionSegundos`.
 * - eliminar() es idempotente: borrar algo que ya no está no es un error,
 *   para poder reintentar sin miedo.
 */
export interface AlmacenamientoDocumentos {
  guardar(archivo: ArchivoAGuardar): Promise<void>;
  urlFirmada(id: string, duracionSegundos: number): Promise<string>;
  eliminar(id: string): Promise<void>;
}

/** El documento pedido ya no existe (se eliminó tras la revisión o nunca se guardó). */
export class DocumentoNoEncontrado extends Error {
  constructor(id: string) {
    super(`El documento ${id} no existe en el almacenamiento.`);
    this.name = "DocumentoNoEncontrado";
  }
}
