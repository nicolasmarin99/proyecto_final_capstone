import {
  TIPO_MIME_IMAGEN,
  type AlmacenamientoPublico,
  type ImagenAGuardar,
  type TipoImagen,
  type VarianteImagen,
} from "./almacenamiento.publico.tipos.js";

/**
 * Imágenes públicas para las pruebas: un Map del proceso, sin red ni disco.
 *
 * Expone contenido() y existe() para que las pruebas afirmen sobre el
 * archivo que recibió el adaptador (por ejemplo, que llegó sin EXIF) y que
 * se eliminó.
 *
 * La URL es una dirección inventada con el id: url() no consulta nada, igual
 * que en Cloudinary, y una prueba puede reconocer qué imagen es.
 */
export class AlmacenamientoPublicoEnMemoria implements AlmacenamientoPublico {
  private readonly archivos = new Map<string, { contenido: Buffer; tipo: TipoImagen }>();

  async guardar({ id, contenido, tipo }: ImagenAGuardar): Promise<void> {
    this.archivos.set(id, { contenido: Buffer.from(contenido), tipo });
  }

  url(id: string, variante: VarianteImagen): string {
    return `https://imagenes.prueba/${variante}/${id}`;
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

  tipoMime(id: string): string | null {
    const archivo = this.archivos.get(id);
    return archivo ? TIPO_MIME_IMAGEN[archivo.tipo] : null;
  }

  get cantidad(): number {
    return this.archivos.size;
  }

  vaciar(): void {
    this.archivos.clear();
  }
}
