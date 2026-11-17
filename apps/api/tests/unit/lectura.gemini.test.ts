import { afterEach, describe, expect, it, vi } from "vitest";
import { LectorDeterminista } from "../../src/modules/lectura-documentos/lectura.determinista.js";
import { LectorGemini } from "../../src/modules/lectura-documentos/lectura.gemini.js";
import { nombresCompatibles } from "../../src/modules/lectura-documentos/lectura.validacion.js";

/*
  El lector de Gemini con fetch SIMULADO: ninguna prueba envía un documento a
  Google. Se comprueba lo que se envía (modelo, documento en línea, esquema
  con SOLO los campos permitidos, clave en la cabecera), los reintentos y el
  tiempo límite, y que lo que vuelve se filtre.
*/

const CLAVE = "clave-ficticia-de-prueba";
const DOCUMENTO = { contenido: Buffer.from("imagen-de-prueba"), tipoMime: "image/jpeg" as const };

function respuesta(campos: Record<string, { valor: string; confianza: number }>) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(campos) }] } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function crear(opciones: { dormir?: (ms: number) => Promise<void>; tiempoLimiteMs?: number } = {}) {
  return new LectorGemini({ clave: CLAVE, modelo: "gemini-3.5-flash-lite", dormir: opciones.dormir ?? (async () => undefined), tiempoLimiteMs: opciones.tiempoLimiteMs });
}

function simularFetch(respuestas: (() => Promise<Response>)[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init: init ?? {} });
      const siguiente = respuestas[llamadas.length - 1];
      if (!siguiente) throw new Error("fetch llamado más veces de lo esperado");
      return siguiente();
    }),
  );
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LectorGemini", () => {
  it("envía el documento en línea al modelo configurado; la clave va en la cabecera, no en la URL", async () => {
    const llamadas = simularFetch([async () => respuesta({ nombre: { valor: "Pedro Soto", confianza: 0.9 } })]);

    await crear().leer(DOCUMENTO, "CERTIFICADO");

    const [llamada] = llamadas;
    expect(llamada?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(llamada?.url).not.toContain(CLAVE);
    expect(new Headers(llamada?.init.headers).get("x-goog-api-key")).toBe(CLAVE);
    const cuerpo = JSON.parse(String(llamada?.init.body));
    expect(cuerpo.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: DOCUMENTO.contenido.toString("base64") } });
    expect(cuerpo.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
  });

  it("para una CEDULA, el esquema de respuesta solo tiene nombre y RUT: no se le pide nada más al modelo", async () => {
    const llamadas = simularFetch([async () => respuesta({})]);

    await crear().leer(DOCUMENTO, "CEDULA");

    const cuerpo = JSON.parse(String(llamadas[0]?.init.body));
    expect(Object.keys(cuerpo.generationConfig.responseSchema.properties)).toEqual(["nombre", "rut"]);
    expect(cuerpo.contents[0].parts[1].text).toMatch(/ÚNICAMENTE el nombre completo y el RUN/);
  });

  it("para un CERTIFICADO pide titular, RUT, título, institución y fechas", async () => {
    const llamadas = simularFetch([async () => respuesta({})]);

    await crear().leer(DOCUMENTO, "CERTIFICADO");

    const cuerpo = JSON.parse(String(llamadas[0]?.init.body));
    expect(Object.keys(cuerpo.generationConfig.responseSchema.properties)).toEqual(["nombre", "rut", "titulo", "institucion", "fechaEmision", "fechaVencimiento"]);
  });

  it("aunque el modelo devuelva de más, de una cédula solo pasan nombre y RUT, con la confianza entre 0 y 1", async () => {
    simularFetch([
      async () =>
        respuesta({
          nombre: { valor: "  SOTO   PÉREZ PEDRO ", confianza: 0.95 },
          rut: { valor: "12.345.678-5", confianza: 1.7 },
          domicilio: { valor: "Av. Siempre Viva 742", confianza: 0.9 },
          fechaNacimiento: { valor: "1985-04-12", confianza: 0.9 },
        }),
    ]);

    const campos = await crear().leer(DOCUMENTO, "CEDULA");

    expect(campos).toEqual([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO", confianza: 0.95 },
      { campo: "rut", valor: "12.345.678-5", confianza: 1 },
    ]);
  });

  it("descarta lo que el modelo escribe cuando no encontró el dato: «No especificado», «N/A» o confianza 0", async () => {
    // Respuesta real del modelo ante una imagen sin texto (probada contra la API con una imagen sintética).
    simularFetch([
      async () =>
        respuesta({
          nombre: { valor: "No especificado", confianza: 0 },
          rut: { valor: "N/A", confianza: 0.4 },
          titulo: { valor: "Instalador eléctrico clase A", confianza: 0 },
          institucion: { valor: "SEC", confianza: 0.9 },
        }),
    ]);

    const campos = await crear().leer(DOCUMENTO, "CERTIFICADO");

    expect(campos).toEqual([{ campo: "institucion", valor: "SEC", confianza: 0.9 }]);
  });

  it("le pide al modelo omitir los datos que no encuentra, sin rellenarlos", async () => {
    const llamadas = simularFetch([async () => respuesta({})]);

    await crear().leer(DOCUMENTO, "CEDULA");

    expect(JSON.parse(String(llamadas[0]?.init.body)).contents[0].parts[1].text).toMatch(/NO incluyas ese campo/);
  });

  it.each([429, 500, 503])("ante %i reintenta 2 veces con espera exponencial (3 llamadas en total)", async (estado) => {
    const esperas: number[] = [];
    const llamadas = simularFetch([
      async () => new Response("", { status: estado }),
      async () => new Response("", { status: estado }),
      async () => respuesta({ nombre: { valor: "Pedro Soto", confianza: 0.9 } }),
    ]);

    const campos = await crear({ dormir: async (ms) => void esperas.push(ms) }).leer(DOCUMENTO, "CEDULA");

    expect(campos).toHaveLength(1);
    expect(llamadas).toHaveLength(3);
    expect(esperas).toEqual([2000, 4000]);
  });

  it("después de 2 reintentos fallidos se rinde y lanza", async () => {
    const llamadas = simularFetch([
      async () => new Response("", { status: 503 }),
      async () => new Response("", { status: 503 }),
      async () => new Response("", { status: 503 }),
    ]);

    await expect(crear().leer(DOCUMENTO, "CEDULA")).rejects.toThrow("503");
    expect(llamadas).toHaveLength(3);
  });

  it.each([400, 403])("un %i no se reintenta, y el mensaje no repite el cuerpo de la respuesta", async (estado) => {
    const llamadas = simularFetch([async () => new Response(JSON.stringify({ error: { message: "contenido: SECRETO" } }), { status: estado })]);

    const promesa = crear().leer(DOCUMENTO, "CEDULA");

    await expect(promesa).rejects.toThrow(String(estado));
    await expect(promesa).rejects.not.toThrow("SECRETO");
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

    await expect(crear({ tiempoLimiteMs: 50 }).leer(DOCUMENTO, "CEDULA")).rejects.toThrow(/tim/i);
  });

  it("el tiempo límite por defecto es de 30 segundos", async () => {
    const espia = vi.spyOn(AbortSignal, "timeout");
    simularFetch([async () => respuesta({})]);

    await new LectorGemini({ clave: CLAVE, modelo: "m" }).leer(DOCUMENTO, "CEDULA");

    expect(espia).toHaveBeenCalledWith(30_000);
  });

  it("una respuesta vacía, bloqueada o que no es JSON es un error claro", async () => {
    simularFetch([async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })]);
    await expect(crear().leer(DOCUMENTO, "CEDULA")).rejects.toThrow("no devolvió contenido");

    simularFetch([async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "no es json" }] } }] }), { status: 200 })]);
    await expect(crear().leer(DOCUMENTO, "CEDULA")).rejects.toThrow("JSON válido");
  });
});

describe("nombresCompatibles (validación cruzada)", () => {
  it.each([
    ["Pedro Soto", "SOTO PÉREZ PEDRO ANTONIO"],
    ["María José de la Fuente", "DE LA FUENTE ROJAS MARÍA JOSÉ"],
    ["Ñuñez", "ñuñez"],
  ])("«%s» y «%s» pueden ser la misma persona", (declarado, leido) => {
    expect(nombresCompatibles(declarado, leido)).toBe(true);
  });

  it.each([
    ["Pedro Soto", "JUAN SOTO"],
    ["Pedro Soto", "RAMÍREZ DÍAZ JUAN CARLOS"],
    ["Pedro Soto", ""],
  ])("«%s» y «%s» difieren de forma significativa", (declarado, leido) => {
    expect(nombresCompatibles(declarado, leido)).toBe(false);
  });
});

describe("LectorDeterminista", () => {
  it("con cualquier contenido da un nombre y un RUT completos (nunca «undefined»), y siempre lo mismo para el mismo documento", async () => {
    const lector = new LectorDeterminista();
    for (let i = 0; i < 300; i += 1) {
      const documento = { contenido: Buffer.from(`documento-${i}`), tipoMime: "image/png" as const };
      const campos = await lector.leer(documento, "CEDULA");
      expect(campos.map((campo) => campo.campo)).toEqual(["nombre", "rut"]);
      expect(JSON.stringify(campos)).not.toContain("undefined");
      expect(await lector.leer(documento, "CEDULA")).toEqual(campos);
    }
  });
});
