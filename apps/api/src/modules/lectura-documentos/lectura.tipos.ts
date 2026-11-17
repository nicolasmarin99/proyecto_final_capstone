/*
  Lectura automática de documentos.

  REGLA CENTRAL: NADA se aprueba automáticamente. La lectura precarga
  campos; un administrador los revisa contra el documento y decide. En este
  módulo no hay ninguna función que cambie el estado de una credencial, y no
  importa nada que pueda hacerlo. El valor del producto es la verificación
  contrastada por una persona: si la decidiera un modelo, dejaría de serlo.
*/

/** Qué documento se lee. Fija qué campos se extraen. */
export type TipoDocumentoLectura = "CEDULA" | "CERTIFICADO" | "CURSO";

/** Los campos que la lectura puede devolver, entre todos los tipos. */
export type CampoLectura = "nombre" | "rut" | "titulo" | "institucion" | "fechaEmision" | "fechaVencimiento";

/**
 * ALCANCE POR TIPO DE DOCUMENTO: lo ÚNICO que se extrae de cada uno.
 *
 * - CEDULA: solo nombre completo y RUT. Ni domicilio, ni fecha de
 *   nacimiento, ni nacionalidad, ni número de documento. Es minimización de
 *   datos y es deliberado: lo que no hace falta para verificar la identidad
 *   no se lee, no se envía de vuelta y no se guarda.
 * - CERTIFICADO y CURSO: titular, RUT si aparece, título, institución
 *   emisora, fecha de emisión y de vencimiento si existe.
 *
 * Esta lista se aplica tres veces: al modelo solo se le piden estos campos
 * (su esquema de respuesta no tiene otros), el resultado se filtra con
 * soloCamposPermitidos() diga lo que diga el lector, y para la cédula la
 * base lo impone con un CHECK.
 */
export const CAMPOS_POR_TIPO: Record<TipoDocumentoLectura, readonly CampoLectura[]> = {
  CEDULA: ["nombre", "rut"],
  CERTIFICADO: ["nombre", "rut", "titulo", "institucion", "fechaEmision", "fechaVencimiento"],
  CURSO: ["nombre", "rut", "titulo", "institucion", "fechaEmision", "fechaVencimiento"],
};

/** Un campo leído del documento, con la confianza que declara el lector (0 a 1). */
export interface CampoExtraido {
  campo: CampoLectura;
  valor: string;
  confianza: number;
}

/** El documento tal como lo entrega el almacenamiento privado. */
export interface DocumentoALeer {
  contenido: Buffer;
  tipoMime: "image/jpeg" | "image/png" | "application/pdf";
}

/**
 * Puerto de salida para leer documentos.
 *
 * El resto de la aplicación depende de esta interfaz y nunca de un
 * proveedor, igual que el correo, el almacenamiento y los embeddings: las
 * pruebas usan LectorDeterminista (sin red) y producción, LectorGemini.
 *
 * leer() devuelve los campos que encontró (puede omitir los que no
 * aparecen en el documento) y SÍ puede lanzar si el proveedor falla: quien
 * llama deja la extracción como FALLIDA y la solicitud sigue su curso.
 */
export interface LectorDocumentos {
  /** Qué modelo hizo la lectura («gemini-3.5-flash-lite»): queda guardado con cada extracción. */
  readonly modelo: string;
  leer(documento: DocumentoALeer, tipo: TipoDocumentoLectura): Promise<CampoExtraido[]>;
}

/** Largo máximo de un valor leído: un nombre o un título, no un párrafo. */
const LARGO_MAXIMO_VALOR = 200;

/**
 * Deja pasar solo los campos permitidos para ese tipo de documento, una vez
 * cada uno, con el valor recortado y la confianza entre 0 y 1. Lo que el
 * lector devuelva de más (un domicilio en una cédula, por ejemplo) se
 * descarta acá, antes de guardarse en ninguna parte.
 */
export function soloCamposPermitidos(tipo: TipoDocumentoLectura, campos: readonly unknown[]): CampoExtraido[] {
  const permitidos = CAMPOS_POR_TIPO[tipo];
  const resultado: CampoExtraido[] = [];

  for (const permitido of permitidos) {
    const encontrado = campos.find(
      (candidato): candidato is { campo: string; valor: string; confianza?: unknown } =>
        typeof candidato === "object" &&
        candidato !== null &&
        "campo" in candidato &&
        candidato.campo === permitido &&
        "valor" in candidato &&
        typeof candidato.valor === "string",
    );
    const valor = encontrado?.valor.replace(/\s+/g, " ").trim().slice(0, LARGO_MAXIMO_VALOR) ?? "";
    if (!encontrado || valor === "") continue;

    const confianza = typeof encontrado.confianza === "number" && Number.isFinite(encontrado.confianza) ? encontrado.confianza : 0;
    resultado.push({ campo: permitido, valor, confianza: Math.min(1, Math.max(0, confianza)) });
  }

  return resultado;
}
