import { env } from "../../env.js";
import { EmbeddingsDeterministas } from "./embeddings.deterministas.js";
import { GeminiEmbeddings } from "./embeddings.gemini.js";
import type { ProveedorEmbeddings } from "./embeddings.tipos.js";

export type { ProveedorEmbeddings, UsoEmbedding } from "./embeddings.tipos.js";
export { EmbeddingsDeterministas } from "./embeddings.deterministas.js";
export { GeminiEmbeddings } from "./embeddings.gemini.js";

let instancia: ProveedorEmbeddings | null = null;

const PROVEEDORES: Record<typeof env.EMBEDDINGS_PROVEEDOR, () => ProveedorEmbeddings> = {
  determinista: () => new EmbeddingsDeterministas(env.EMBEDDINGS_DIMENSIONES),
  gemini: () =>
    new GeminiEmbeddings({ clave: env.GEMINI_API_KEY, modelo: env.EMBEDDINGS_MODELO, dimensiones: env.EMBEDDINGS_DIMENSIONES }),
};

/**
 * Única puerta al proveedor de embeddings, elegido por EMBEDDINGS_PROVEEDOR.
 * Se construye una vez y se reutiliza, igual que el correo.
 *
 * El mapa obliga a cubrir todos los valores del enum: si mañana se agrega un
 * proveedor a env.ts y se olvida acá, no compila.
 */
export function obtenerProveedorEmbeddings(): ProveedorEmbeddings {
  if (!instancia) {
    instancia = PROVEEDORES[env.EMBEDDINGS_PROVEEDOR]();
    if (env.NODE_ENV === "production" && env.EMBEDDINGS_PROVEEDOR === "determinista") {
      // No se detiene la API: la búsqueda por palabras sigue funcionando. Pero
      // la búsqueda por significado queda con el sustituto de pruebas.
      console.warn("EMBEDDINGS_PROVEEDOR=determinista en producción: configura gemini y GEMINI_API_KEY.");
    }
  }
  return instancia;
}
