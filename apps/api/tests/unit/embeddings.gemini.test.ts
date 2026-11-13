import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiEmbeddings, MAXIMO_TEXTOS_POR_LLAMADA } from "../../src/modules/embeddings/embeddings.gemini.js";

/*
  El adaptador de Gemini con fetch SIMULADO: ninguna prueba sale a la red.
  Se comprueba lo que se envía (modelo, dimensiones, tipo de tarea, clave en
  la cabecera y no en la URL), los reintentos ante 429 y 5xx, que un 400 no
  se reintente, el tiempo límite y la validación de lo que vuelve.
*/

const CLAVE = "clave-ficticia-de-prueba";

function vectorDe(semilla: number, largo = 768): number[] {
  return Array.from({ length: largo }, (_, indice) => ((indice + semilla) % 7) - 3);
}

function respuestaOk(cantidad: number, largo = 768) {
  return new Response(JSON.stringify({ embeddings: Array.from({ length: cantidad }, (_, i) => ({ values: vectorDe(i, largo) })) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function crear(opciones: { dormir?: (ms: number) => Promise<void>; tiempoLimiteMs?: number } = {}) {
  return new GeminiEmbeddings({
    clave: CLAVE,
    modelo: "gemini-embedding-001",
    dimensiones: 768,
    dormir: opciones.dormir ?? (async () => undefined),
    tiempoLimiteMs: opciones.tiempoLimiteMs,
  });
}

/** Simula fetch con una lista de respuestas, en orden, y registra las llamadas. */
function simularFetch(respuestas: (() => Promise<Response>)[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const simulado = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    const siguiente = respuestas[llamadas.length - 1];
    if (!siguiente) throw new Error("fetch llamado más veces de lo esperado");
    return siguiente();
  });
  vi.stubGlobal("fetch", simulado);
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiEmbeddings", () => {
  it("pide un lote con el modelo, 768 dimensiones y el tipo de tarea; la clave va en la cabecera, no en la URL", async () => {
    const llamadas = simularFetch([async () => respuestaOk(2)]);

    const vectores = await crear().vectorizar(["Destape de cañerías", "Instalación de enchufes"], "documento");

    expect(vectores).toHaveLength(2);
    expect(vectores.every((vector) => vector.length === 768)).toBe(true);
    expect(llamadas).toHaveLength(1);
    const [llamada] = llamadas;
    expect(llamada?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents");
    expect(llamada?.url).not.toContain(CLAVE);
    expect(new Headers(llamada?.init.headers).get("x-goog-api-key")).toBe(CLAVE);
    const cuerpo = JSON.parse(String(llamada?.init.body));
    expect(cuerpo.requests).toHaveLength(2);
    expect(cuerpo.requests[0]).toEqual({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: "Destape de cañerías" }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768,
    });
  });

  it("una consulta del buscador usa RETRIEVAL_QUERY", async () => {
    const llamadas = simularFetch([async () => respuestaOk(1)]);

    await crear().vectorizar(["se me tapó el baño"], "consulta");

    expect(JSON.parse(String(llamadas[0]?.init.body)).requests[0].taskType).toBe("RETRIEVAL_QUERY");
  });

  it("devuelve vectores normalizados (largo 1)", async () => {
    simularFetch([async () => respuestaOk(1)]);

    const [vector] = await crear().vectorizar(["texto"], "documento");

    const largo = Math.sqrt((vector ?? []).reduce((suma, valor) => suma + valor * valor, 0));
    expect(largo).toBeCloseTo(1, 10);
  });

  it(`parte en varias llamadas un lote de más de ${MAXIMO_TEXTOS_POR_LLAMADA} textos`, async () => {
    const llamadas = simularFetch([async () => respuestaOk(MAXIMO_TEXTOS_POR_LLAMADA), async () => respuestaOk(5)]);

    const vectores = await crear().vectorizar(
      Array.from({ length: MAXIMO_TEXTOS_POR_LLAMADA + 5 }, (_, i) => `servicio ${i}`),
      "documento",
    );

    expect(llamadas).toHaveLength(2);
    expect(vectores).toHaveLength(MAXIMO_TEXTOS_POR_LLAMADA + 5);
  });

  it.each([429, 500, 503])("ante %i reintenta con espera exponencial y sale bien al tercer intento", async (estado) => {
    const esperas: number[] = [];
    const llamadas = simularFetch([
      async () => new Response("", { status: estado }),
      async () => new Response("", { status: estado }),
      async () => respuestaOk(1),
    ]);

    const vectores = await crear({ dormir: async (ms) => void esperas.push(ms) }).vectorizar(["texto"], "documento");

    expect(vectores).toHaveLength(1);
    expect(llamadas).toHaveLength(3);
    expect(esperas).toEqual([1000, 2000]);
  });

  it("después de 3 intentos fallidos se rinde y lanza (como máximo 3 llamadas)", async () => {
    const llamadas = simularFetch([
      async () => new Response("", { status: 503 }),
      async () => new Response("", { status: 503 }),
      async () => new Response("", { status: 503 }),
    ]);

    await expect(crear().vectorizar(["texto"], "documento")).rejects.toThrow("503");
    expect(llamadas).toHaveLength(3);
  });

  it.each([400, 403])("un %i no se reintenta: esperar no lo arregla", async (estado) => {
    const llamadas = simularFetch([async () => new Response(JSON.stringify({ error: { message: "texto enviado: secreto" } }), { status: estado })]);

    const promesa = crear().vectorizar(["texto"], "documento");

    await expect(promesa).rejects.toThrow(String(estado));
    // El mensaje no repite el cuerpo de la respuesta (podría traer el texto enviado).
    await expect(promesa).rejects.not.toThrow("secreto");
    expect(llamadas).toHaveLength(1);
  });

  it("aborta la llamada que pasa el tiempo límite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolver, rechazar) => {
            init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason));
          }),
      ),
    );

    await expect(crear({ tiempoLimiteMs: 50 }).vectorizar(["texto"], "documento")).rejects.toThrow(/tim/i);
  });

  it("rechaza una respuesta con vectores del largo equivocado o en cantidad distinta", async () => {
    simularFetch([async () => respuestaOk(1, 3072)]);
    await expect(crear().vectorizar(["texto"], "documento")).rejects.toThrow("vector inválido");

    simularFetch([async () => respuestaOk(1)]);
    await expect(crear().vectorizar(["uno", "dos"], "documento")).rejects.toThrow("cantidad de vectores");
  });
});
