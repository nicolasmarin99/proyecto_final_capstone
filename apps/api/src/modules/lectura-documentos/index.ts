import { env } from "../../env.js";
import { LectorDeterminista } from "./lectura.determinista.js";
import { LectorGemini } from "./lectura.gemini.js";
import type { LectorDocumentos } from "./lectura.tipos.js";

export type { CampoExtraido, CampoLectura, DocumentoALeer, LectorDocumentos, TipoDocumentoLectura } from "./lectura.tipos.js";
export { CAMPOS_POR_TIPO, soloCamposPermitidos } from "./lectura.tipos.js";
export { LectorDeterminista } from "./lectura.determinista.js";
export { LectorGemini } from "./lectura.gemini.js";

let instancia: LectorDocumentos | null | undefined;

const PROVEEDORES: Record<typeof env.LECTURA_PROVEEDOR, () => LectorDocumentos | null> = {
  // Lectura apagada: no se crea ninguna extracción y el panel funciona a mano.
  ninguno: () => null,
  determinista: () => new LectorDeterminista(),
  gemini: () => new LectorGemini({ clave: env.GEMINI_API_KEY, modelo: env.LECTURA_MODELO }),
};

/**
 * Única puerta al lector de documentos, elegido por LECTURA_PROVEEDOR. Se
 * construye una vez y se reutiliza, igual que el correo y los embeddings.
 * Devuelve null con LECTURA_PROVEEDOR=ninguno: la lectura está apagada.
 *
 * El mapa obliga a cubrir todos los valores del enum: si mañana se agrega un
 * proveedor a env.ts y se olvida acá, no compila.
 */
export function obtenerLectorDocumentos(): LectorDocumentos | null {
  if (instancia === undefined) instancia = PROVEEDORES[env.LECTURA_PROVEEDOR]();
  return instancia;
}
