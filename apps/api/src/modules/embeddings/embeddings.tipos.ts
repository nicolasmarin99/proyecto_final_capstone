/**
 * Para qué se vectoriza un texto. Algunos modelos (Gemini, entre ellos)
 * producen vectores distintos para lo que se guarda y para lo que se busca,
 * y comparan mejor así: un servicio es un «documento», lo que escribe la
 * persona en el buscador es una «consulta».
 */
export type UsoEmbedding = "documento" | "consulta";

/**
 * Puerto de salida para los embeddings: convierte textos en vectores.
 *
 * El resto de la aplicación depende de esta interfaz y nunca de un proveedor
 * concreto, igual que el correo y el almacenamiento. Las pruebas usan
 * EmbeddingsDeterministas (sin red); producción, GeminiEmbeddings; y cambiar
 * de proveedor mañana es tocar un archivo y la variable EMBEDDINGS_PROVEEDOR.
 *
 * vectorizar() recibe varios textos a la vez: así se paga una llamada por
 * lote y no una por servicio. Devuelve un vector por texto, en el mismo
 * orden, cada uno con exactamente `dimensiones` números.
 *
 * vectorizar() SÍ puede lanzar si el proveedor falla: es la única forma de
 * que el motivo llegue al log. Que ese fallo no tumbe la publicación de un
 * servicio lo resuelve quien llama (servicios.indexacion.ts).
 */
export interface ProveedorEmbeddings {
  /**
   * Identifica proveedor, modelo y dimensiones («gemini:gemini-embedding-001:768»).
   * Entra en el hash de cada servicio: si cambia el modelo, todos los
   * vectores quedan desactualizados y el script de regeneración los rehace.
   */
  readonly identificador: string;
  readonly dimensiones: number;
  vectorizar(textos: string[], uso: UsoEmbedding): Promise<number[][]>;
}

/** Un vector inválido (largo distinto, NaN, infinito) nunca llega a la base. */
export function validarVector(vector: number[], dimensiones: number): number[] {
  if (vector.length !== dimensiones || !vector.every(Number.isFinite)) {
    throw new Error(`El proveedor de embeddings devolvió un vector inválido (se esperaban ${dimensiones} números).`);
  }
  return vector;
}

/** Escala el vector a largo 1. Con coseno no cambia nada, pero deja todos los vectores comparables. */
export function normalizar(vector: number[]): number[] {
  const largo = Math.sqrt(vector.reduce((suma, valor) => suma + valor * valor, 0));
  return largo === 0 ? vector : vector.map((valor) => valor / largo);
}
