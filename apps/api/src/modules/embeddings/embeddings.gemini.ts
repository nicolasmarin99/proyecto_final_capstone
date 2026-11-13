import { normalizar, validarVector, type ProveedorEmbeddings, type UsoEmbedding } from "./embeddings.tipos.js";

/*
  Embeddings con la API de Gemini (Google AI), por HTTP con fetch: no hace
  falta el SDK de Google para una sola llamada REST, y así no se agrega una
  dependencia.

  Endpoint: POST /v1beta/models/{modelo}:batchEmbedContents. Recibe varios
  textos en una sola petición y devuelve un vector por texto, en orden.

  - La clave viaja en la cabecera x-goog-api-key y NUNCA en la URL: una URL
    termina en logs de proxies y en mensajes de error; una cabecera, no.
  - outputDimensionality = 768: el modelo entrega 3072 por defecto y acepta
    768 como tamaño reducido recomendado. Google indica normalizar los
    vectores reducidos; se normalizan acá.
  - taskType: RETRIEVAL_DOCUMENT para los servicios y RETRIEVAL_QUERY para
    lo que se escribe en el buscador (ver UsoEmbedding).
*/

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Textos por petición. Los lotes más grandes se parten en varias llamadas. */
export const MAXIMO_TEXTOS_POR_LLAMADA = 100;

const TIPO_TAREA: Record<UsoEmbedding, string> = {
  documento: "RETRIEVAL_DOCUMENT",
  consulta: "RETRIEVAL_QUERY",
};

/** Un error que vale la pena reintentar: 429 (cuota) o 5xx (falla del servicio). */
class ErrorReintentable extends Error {}

export interface OpcionesGemini {
  clave: string;
  modelo: string;
  dimensiones: number;
  /** Intentos en total, contando el primero. */
  intentos?: number;
  /** Tiempo máximo de cada llamada, en milisegundos. */
  tiempoLimiteMs?: number;
  /** Espera antes del primer reintento; se duplica en cada uno (1 s, 2 s…). */
  esperaBaseMs?: number;
  /** Inyectable para que las pruebas no esperen de verdad. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function partirEnLotes<T>(elementos: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < elementos.length; inicio += tamano) lotes.push(elementos.slice(inicio, inicio + tamano));
  return lotes;
}

export class GeminiEmbeddings implements ProveedorEmbeddings {
  readonly identificador: string;
  readonly dimensiones: number;
  private readonly clave: string;
  private readonly modelo: string;
  private readonly intentos: number;
  private readonly tiempoLimiteMs: number;
  private readonly esperaBaseMs: number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(opciones: OpcionesGemini) {
    this.clave = opciones.clave;
    this.modelo = opciones.modelo;
    this.dimensiones = opciones.dimensiones;
    this.intentos = opciones.intentos ?? 3;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? 10_000;
    this.esperaBaseMs = opciones.esperaBaseMs ?? 1_000;
    this.dormir = opciones.dormir ?? dormirDeVerdad;
    this.identificador = `gemini:${this.modelo}:${this.dimensiones}`;
  }

  async vectorizar(textos: string[], uso: UsoEmbedding): Promise<number[][]> {
    const vectores: number[][] = [];
    for (const lote of partirEnLotes(textos, MAXIMO_TEXTOS_POR_LLAMADA)) {
      vectores.push(...(await this.conReintentos(lote, uso)));
    }
    return vectores;
  }

  /**
   * Hasta `intentos` llamadas, con espera exponencial entre ellas, pero solo
   * ante 429 o 5xx: un 400 (texto inválido) o un 403 (clave mala) no se
   * arreglan esperando, y reintentarlos solo gasta tiempo.
   */
  private async conReintentos(lote: string[], uso: UsoEmbedding): Promise<number[][]> {
    for (let intento = 1; ; intento += 1) {
      try {
        return await this.llamar(lote, uso);
      } catch (error) {
        if (!(error instanceof ErrorReintentable) || intento >= this.intentos) throw error;
        await this.dormir(this.esperaBaseMs * 2 ** (intento - 1));
      }
    }
  }

  private async llamar(lote: string[], uso: UsoEmbedding): Promise<number[][]> {
    const nombreModelo = `models/${this.modelo}`;
    const respuesta = await fetch(`${URL_BASE}/${nombreModelo}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.clave },
      body: JSON.stringify({
        requests: lote.map((texto) => ({
          model: nombreModelo,
          content: { parts: [{ text: texto }] },
          taskType: TIPO_TAREA[uso],
          outputDimensionality: this.dimensiones,
        })),
      }),
      // Pasado este tiempo, fetch se aborta y lanza: la llamada no queda colgando.
      signal: AbortSignal.timeout(this.tiempoLimiteMs),
    });

    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorReintentable(`Gemini respondió ${respuesta.status}.`);
    }
    if (!respuesta.ok) {
      // Solo el código: el cuerpo del error puede repetir el texto enviado.
      throw new Error(`Gemini rechazó la petición de embeddings (${respuesta.status}).`);
    }

    const cuerpo: unknown = await respuesta.json();
    const embeddings = esObjeto(cuerpo) && Array.isArray(cuerpo.embeddings) ? cuerpo.embeddings : null;
    if (!embeddings || embeddings.length !== lote.length) {
      throw new Error("Gemini devolvió una cantidad de vectores distinta de la pedida.");
    }

    return embeddings.map((embedding: unknown) => {
      const valores = esObjeto(embedding) && Array.isArray(embedding.values) ? embedding.values : [];
      const numeros = valores.map((valor: unknown) => (typeof valor === "number" ? valor : Number.NaN));
      return normalizar(validarVector(numeros, this.dimensiones));
    });
  }
}
