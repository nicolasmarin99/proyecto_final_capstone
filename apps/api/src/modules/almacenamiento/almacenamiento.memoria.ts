import {
  DocumentoNoEncontrado,
  type AlmacenamientoDocumentos,
  type ArchivoAGuardar,
  type TipoDocumento,
} from "./almacenamiento.tipos.js";

const TIPO_MIME: Record<TipoDocumento, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

/**
 * Almacenamiento de pruebas y de desarrollo local: guarda los archivos en un
 * Map del proceso. No toca la red y se pierde al reiniciar la API.
 *
 * Expone existe() y contenido() para que las pruebas puedan afirmar que un
 * documento se guardó sin metadatos y que se eliminó tras la revisión.
 *
 * La "URL firmada" es una URL data: con el contenido. Sirve para ver una
 * imagen en desarrollo, pero no rasteriza: un PDF se entrega tal cual. Esa
 * parte del contrato solo la cumple el adaptador de producción.
 */
export class AlmacenamientoEnMemoria implements AlmacenamientoDocumentos {
  private readonly archivos = new Map<string, { contenido: Buffer; tipo: TipoDocumento }>();

  async guardar({ id, contenido, tipo }: ArchivoAGuardar): Promise<void> {
    // Copia: si quien llamó reutiliza el Buffer, lo guardado no cambia.
    this.archivos.set(id, { contenido: Buffer.from(contenido), tipo });
  }

  async urlFirmada(id: string, _duracionSegundos: number): Promise<string> {
    const archivo = this.archivos.get(id);

    if (!archivo) {
      throw new DocumentoNoEncontrado(id);
    }

    return `data:${TIPO_MIME[archivo.tipo]};base64,${archivo.contenido.toString("base64")}`;
  }

  async eliminar(id: string): Promise<void> {
    this.archivos.delete(id);
  }

  existe(id: string): boolean {
    return this.archivos.has(id);
  }

  contenido(id: string): Buffer | null {
    return this.archivos.get(id)?.contenido ?? null;
  }

  get cantidad(): number {
    return this.archivos.size;
  }

  vaciar(): void {
    this.archivos.clear();
  }
}
