import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AlmacenamientoPublico, ImagenAGuardar, TipoImagen, VarianteImagen } from "./almacenamiento.publico.tipos.js";

const EXTENSIONES: TipoImagen[] = ["jpg", "png", "webp"];

/** Ids que genera el servidor (uuid). Cualquier otra forma se rechaza antes de tocar el disco. */
const ID_VALIDO = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Imágenes públicas en una carpeta local: SOLO para desarrollo.
 *
 * Existe porque en memoria las imágenes se pierden al reiniciar la API, y el
 * seed de demostración (otro proceso) no podría dejarlas donde la API las
 * encuentre. La API las sirve en /imagenes-locales/:id (ver app.ts), y la web
 * llega ahí por el proxy de Vite, con el prefijo /api.
 *
 * En producción nunca se usa: con ALMACENAMIENTO_TRANSPORTE=produccion las
 * imágenes van a Cloudinary (ver env.ts). El disco de Render, además, se
 * borra en cada despliegue.
 */
export class AlmacenamientoPublicoEnDisco implements AlmacenamientoPublico {
  constructor(
    private readonly carpeta: string,
    private readonly prefijoUrl = "/api/imagenes-locales",
  ) {}

  private ruta(id: string, tipo: TipoImagen): string {
    if (!ID_VALIDO.test(id)) {
      throw new Error("Identificador de imagen no válido.");
    }
    return path.join(this.carpeta, `${id}.${tipo}`);
  }

  async guardar({ id, contenido, tipo }: ImagenAGuardar): Promise<void> {
    await mkdir(this.carpeta, { recursive: true });
    // flag "wx": falla si ya existe. Un id repetido es un error, no algo que pisar.
    await writeFile(this.ruta(id, tipo), contenido, { flag: "wx" });
  }

  /** En disco no hay transformaciones: las dos variantes son el mismo archivo. */
  url(id: string, _variante: VarianteImagen): string {
    return `${this.prefijoUrl}/${encodeURIComponent(id)}`;
  }

  async eliminar(id: string): Promise<void> {
    await Promise.all(EXTENSIONES.map((tipo) => rm(this.ruta(id, tipo), { force: true })));
  }

  /** Para la ruta que las sirve. null si el id no es válido o no existe. */
  async leer(id: string): Promise<{ contenido: Buffer; tipo: TipoImagen } | null> {
    if (!ID_VALIDO.test(id)) return null;

    for (const tipo of EXTENSIONES) {
      try {
        return { contenido: await readFile(this.ruta(id, tipo)), tipo };
      } catch {
        // No está con esta extensión: se prueba la siguiente.
      }
    }
    return null;
  }
}
