import {
  CAMPOS_POR_TIPO,
  soloCamposPermitidos,
  type CampoExtraido,
  type CampoLectura,
  type DocumentoALeer,
  type LectorDocumentos,
  type TipoDocumentoLectura,
} from "./lectura.tipos.js";

/*
  Lectura de documentos con Gemini multimodal, por HTTP con fetch (sin SDK:
  es una sola llamada REST, igual que los embeddings).

  Endpoint: POST /v1beta/models/{modelo}:generateContent, con el documento en
  línea (base64) y un esquema de respuesta JSON.

  - La clave viaja en la cabecera x-goog-api-key, nunca en la URL.
  - El esquema de respuesta SOLO tiene los campos permitidos para ese tipo
    de documento: para una cédula, nombre y RUT. Al modelo no se le pide (ni
    se le deja devolver) nada más. Aun así, el resultado se vuelve a filtrar.
  - La confianza de cada campo la declara el propio modelo. Es una
    estimación suya, no una probabilidad calibrada: sirve para ordenar la
    atención del administrador, no para decidir nada.
  - Ni el documento ni lo leído se escriben en ningún log.
*/

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";

const DESCRIPCION_CAMPO: Record<CampoLectura, string> = {
  nombre: "Nombre completo del titular, nombres y apellidos, tal como aparece.",
  rut: "RUT o RUN del titular, con dígito verificador (por ejemplo 12.345.678-5).",
  titulo: "Título o nombre del certificado o del curso.",
  institucion: "Institución que emite el documento.",
  fechaEmision: "Fecha de emisión (o de término del curso), en formato AAAA-MM-DD.",
  fechaVencimiento: "Fecha de vencimiento o vigencia, en formato AAAA-MM-DD, solo si el documento la indica.",
};

const INSTRUCCION: Record<TipoDocumentoLectura, string> = {
  CEDULA:
    "Este es un documento de identidad chileno. Extrae ÚNICAMENTE el nombre completo y el RUN del titular. " +
    "No extraigas ni menciones ningún otro dato del documento.",
  CERTIFICADO: "Este es un certificado o credencial profesional. Extrae los datos indicados.",
  CURSO: "Este es un certificado de un curso o capacitación. Extrae los datos indicados.",
};

const REGLAS =
  " Copia cada valor tal como aparece, sin corregirlo ni completarlo. Si un dato no aparece o no se lee, " +
  "NO incluyas ese campo en la respuesta: no escribas «No especificado», «N/A» ni nada parecido, y no lo " +
  "inventes. Para cada campo indica tu confianza de 0 a 1 en que lo leíste bien (baja si la imagen está " +
  "borrosa, cortada o el texto es ambiguo).";

/**
 * Lo que el modelo escribe cuando NO encontró el dato, aunque se le pida
 * omitirlo (pasa: ante una imagen sin texto devuelve «No especificado» con
 * confianza 0). Un valor así no es una lectura: se descarta, para no
 * mostrarlo como sugerencia ni disparar una alerta falsa.
 */
const SIN_DATO = /^(no (especificad[oa]|indicad[oa]|aparece|disponible|legible|visible|se (lee|ve|indica|encuentra))|n\/?a|desconocid[oa]|ningun[oa]?|sin (dato|informaci[oó]n)|null|-+|\?+)$/i;

/** ¿El modelo de verdad leyó algo? Con confianza 0 o un valor de relleno, no. */
function esLectura(valor: unknown, confianza: unknown): boolean {
  if (typeof valor !== "string" || SIN_DATO.test(valor.trim())) return false;
  return typeof confianza === "number" && confianza > 0;
}

/** Un error que vale la pena reintentar: 429 (cuota) o 5xx (falla del servicio). */
class ErrorReintentable extends Error {}

export interface OpcionesLectorGemini {
  clave: string;
  modelo: string;
  /** Reintentos después del primer intento. */
  reintentos?: number;
  /** Tiempo máximo de cada llamada, en milisegundos. */
  tiempoLimiteMs?: number;
  /** Espera antes del primer reintento; se duplica en el siguiente. */
  esperaBaseMs?: number;
  /** Inyectable para que las pruebas no esperen de verdad. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/** El esquema de respuesta: un objeto por campo permitido, con valor y confianza. */
function esquemaDe(tipo: TipoDocumentoLectura) {
  const propiedades: Record<string, unknown> = {};
  for (const campo of CAMPOS_POR_TIPO[tipo]) {
    propiedades[campo] = {
      type: "OBJECT",
      description: DESCRIPCION_CAMPO[campo],
      properties: { valor: { type: "STRING" }, confianza: { type: "NUMBER" } },
      required: ["valor", "confianza"],
    };
  }
  return { type: "OBJECT", properties: propiedades };
}

export class LectorGemini implements LectorDocumentos {
  readonly modelo: string;
  private readonly clave: string;
  private readonly reintentos: number;
  private readonly tiempoLimiteMs: number;
  private readonly esperaBaseMs: number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(opciones: OpcionesLectorGemini) {
    this.clave = opciones.clave;
    this.modelo = opciones.modelo;
    this.reintentos = opciones.reintentos ?? 2;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? 30_000;
    this.esperaBaseMs = opciones.esperaBaseMs ?? 2_000;
    this.dormir = opciones.dormir ?? dormirDeVerdad;
  }

  /**
   * Un intento más hasta `reintentos` reintentos, pero solo ante 429 o 5xx:
   * un 400 (documento ilegible para la API) o un 403 (clave mala) no se
   * arreglan esperando.
   */
  async leer(documento: DocumentoALeer, tipo: TipoDocumentoLectura): Promise<CampoExtraido[]> {
    for (let intento = 0; ; intento += 1) {
      try {
        return await this.llamar(documento, tipo);
      } catch (error) {
        if (!(error instanceof ErrorReintentable) || intento >= this.reintentos) throw error;
        await this.dormir(this.esperaBaseMs * 2 ** intento);
      }
    }
  }

  private async llamar(documento: DocumentoALeer, tipo: TipoDocumentoLectura): Promise<CampoExtraido[]> {
    const respuesta = await fetch(`${URL_BASE}/models/${this.modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.clave },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: documento.tipoMime, data: documento.contenido.toString("base64") } },
              { text: INSTRUCCION[tipo] + REGLAS },
            ],
          },
        ],
        generationConfig: {
          // Lectura literal: sin creatividad.
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: esquemaDe(tipo),
        },
      }),
      // Pasado este tiempo, fetch se aborta y lanza: la llamada no queda colgando.
      signal: AbortSignal.timeout(this.tiempoLimiteMs),
    });

    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorReintentable(`Gemini respondió ${respuesta.status}.`);
    }
    if (!respuesta.ok) {
      // Solo el código: el cuerpo del error podría repetir parte de lo enviado.
      throw new Error(`Gemini rechazó la lectura del documento (${respuesta.status}).`);
    }

    const cuerpo: unknown = await respuesta.json();
    const texto = this.textoDe(cuerpo);
    let leido: unknown;
    try {
      leido = JSON.parse(texto);
    } catch {
      throw new Error("Gemini no devolvió un JSON válido.");
    }
    if (!esObjeto(leido)) throw new Error("Gemini no devolvió un objeto con los campos.");

    // { nombre: { valor, confianza }, … } → [{ campo, valor, confianza }], solo lo permitido.
    const campos = Object.entries(leido).map(([campo, dato]) =>
      esObjeto(dato) && esLectura(dato.valor, dato.confianza) ? { campo, valor: dato.valor, confianza: dato.confianza } : null,
    );
    return soloCamposPermitidos(tipo, campos);
  }

  /** El texto del primer candidato; error claro si la respuesta vino vacía o bloqueada. */
  private textoDe(cuerpo: unknown): string {
    const candidatos = esObjeto(cuerpo) && Array.isArray(cuerpo.candidates) ? cuerpo.candidates : [];
    const primero: unknown = candidatos[0];
    const contenido = esObjeto(primero) && esObjeto(primero.content) ? primero.content : null;
    const partes = contenido && Array.isArray(contenido.parts) ? contenido.parts : [];
    const texto = partes.map((parte: unknown) => (esObjeto(parte) && typeof parte.text === "string" ? parte.text : "")).join("");
    if (texto === "") throw new Error("Gemini no devolvió contenido (respuesta vacía o bloqueada).");
    return texto;
  }
}
