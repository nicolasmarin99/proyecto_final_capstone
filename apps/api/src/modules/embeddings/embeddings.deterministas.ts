import { createHash } from "node:crypto";
import { normalizar, type ProveedorEmbeddings } from "./embeddings.tipos.js";

/*
  Embeddings deterministas: el vector sale de un hash, sin red ni clave.
  Es el proveedor de las pruebas (ninguna llama a Google) y del desarrollo
  sin cuenta de Gemini.

  Un hash puro del texto completo daría vectores al azar: «se me tapó el
  baño» y «destape de alcantarillado» quedarían tan lejos como cualquier
  otro par, y no habría forma de probar que la búsqueda por significado
  funciona. Por eso el texto se reduce primero a CONCEPTOS:

  1. Se pasa a minúsculas, sin tildes, y se separa en palabras.
  2. Cada palabra se busca en el diccionario de abajo por su raíz («tapó»,
     «tapado» y «destape» comparten el concepto «desague»). Las que no están
     en el diccionario cuentan como ellas mismas, con poco peso.
  3. Cada concepto (y cada palabra suelta) tiene un vector fijo derivado de
     su hash SHA-256. El vector del texto es la suma ponderada, normalizada.

  Resultado: dos textos que comparten conceptos quedan cerca (coseno alto),
  y uno sin nada en común queda casi perpendicular (coseno cercano a 0),
  así el umbral de similitud se puede probar de verdad.

  NO es un modelo de lenguaje: solo «entiende» lo que está en el
  diccionario. La calidad real de la búsqueda la da Gemini; este proveedor
  existe para probar todo el camino (indexar, guardar, buscar, fusionar,
  filtrar) sin depender de la red.
*/

/**
 * Raíces por concepto, sin tildes. Una palabra pertenece al concepto de la
 * raíz MÁS LARGA con que empieza («refrigerador» → electrodomésticos,
 * «refrigeración» → climatización).
 */
const CONCEPTOS: Record<string, string[]> = {
  desague: ["tapa", "tapo", "tape", "destap", "alcantar", "desag", "caneri", "bano", "excusad", "inodoro", "wc", "lavaplato", "atasc", "camara", "olor"],
  agua: ["gasfit", "calefon", "filtrac", "grifer", "agua", "fuga", "gotea", "termo", "ducha", "lavamano", "calentador"],
  electricidad: ["electric", "enchuf", "luz", "luces", "lumin", "interrupt", "tablero", "cortocirc", "apagon", "foco", "lampar", "cable", "automatico", "diferencial", "corriente", "te1"],
  cerrajeria: ["cerraj", "llave", "chapa", "candad", "cerradur", "encerr", "copia"],
  carpinteria: ["carpint", "mueble", "madera", "closet", "repisa", "melamin", "bisagra", "ventana", "puerta", "cocina"],
  eventos: ["banquet", "coctel", "evento", "cumplea", "fiesta", "matrimon", "bocado", "garzon", "comida", "celebra", "invitad", "cena"],
  metal: ["sold", "fierro", "metal", "reja", "porton", "estructur", "herreri", "protecci"],
  pintura: ["pint", "empaste", "muro", "pared", "grieta", "cielo", "esmalte", "brocha"],
  climatizacion: ["clima", "aire", "acondicion", "calor", "frio", "refrigeracion", "ventila", "calefacc", "temperatura"],
  electrodomesticos: ["electrodom", "lavadora", "refrigerador", "secadora", "horno", "microond", "cocinilla", "lavavajilla"],
  jardin: ["jardin", "pasto", "cesped", "poda", "arbol", "planta", "riego", "maleza"],
  limpieza: ["limpi", "aseo", "alfombra", "sucio", "mancha", "tapiz", "sillon"],
};

/** Palabras sin contenido: no aportan al vector. */
const VACIAS = new Set(
  "a al algo como con de del el en es esta este hay la las le lo los mas me mi mis muy no o para pero por que se si sin su sus te tengo tu un una uno unos y ya yo".split(" "),
);

/** Peso de una palabra que no está en el diccionario, frente a 1 de un concepto. */
const PESO_PALABRA = 0.3;

/** [raíz, concepto], de la raíz más larga a la más corta. */
const RAICES: [string, string][] = Object.entries(CONCEPTOS)
  .flatMap(([concepto, raices]) => raices.map((raiz): [string, string] => [raiz, concepto]))
  .sort((a, b) => b[0].length - a[0].length);

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function conceptoDe(palabra: string): string | null {
  return RAICES.find(([raiz]) => palabra.startsWith(raiz))?.[1] ?? null;
}

export class EmbeddingsDeterministas implements ProveedorEmbeddings {
  readonly identificador: string;
  private readonly bases = new Map<string, number[]>();

  constructor(readonly dimensiones: number) {
    this.identificador = `determinista-v1:${dimensiones}`;
  }

  async vectorizar(textos: string[]): Promise<number[][]> {
    return textos.map((texto) => this.vectorDe(texto));
  }

  private vectorDe(texto: string): number[] {
    const pesos = new Map<string, number>();
    for (const palabra of sinTildes(texto).split(/[^a-z0-9ñ]+/)) {
      if (palabra.length < 2 || VACIAS.has(palabra)) continue;
      const concepto = conceptoDe(palabra);
      const clave = concepto ? `concepto:${concepto}` : `palabra:${palabra}`;
      pesos.set(clave, (pesos.get(clave) ?? 0) + (concepto ? 1 : PESO_PALABRA));
    }
    // Un texto sin palabras útiles igual recibe un vector propio (nunca el vector cero).
    if (pesos.size === 0) pesos.set(`texto:${texto}`, 1);

    const suma = new Array<number>(this.dimensiones).fill(0);
    for (const [clave, peso] of pesos) {
      const base = this.base(clave);
      for (let i = 0; i < this.dimensiones; i += 1) suma[i] = (suma[i] ?? 0) + peso * (base[i] ?? 0);
    }
    return normalizar(suma);
  }

  /**
   * Vector fijo de una clave: un generador pseudoaleatorio (mulberry32)
   * sembrado con su SHA-256. Mismo texto, mismo vector, en cualquier máquina.
   */
  private base(clave: string): number[] {
    const guardado = this.bases.get(clave);
    if (guardado) return guardado;

    let estado = createHash("sha256").update(clave).digest().readUInt32LE(0);
    const siguiente = () => {
      estado = (estado + 0x6d2b79f5) | 0;
      let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const vector = normalizar(Array.from({ length: this.dimensiones }, () => siguiente() * 2 - 1));

    // Tope de memoria: el vocabulario de un proceso largo no crece sin límite.
    if (this.bases.size > 20_000) this.bases.clear();
    this.bases.set(clave, vector);
    return vector;
  }
}
