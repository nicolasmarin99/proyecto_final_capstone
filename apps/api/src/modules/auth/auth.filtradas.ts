import { createHash } from "node:crypto";
import { env } from "../../env.js";

const URL_RANGOS = "https://api.pwnedpasswords.com/range/";

/**
 * Tope de espera. Corto a propósito: esto corre dentro del registro, y si el
 * servicio externo se demora, lo correcto es dejar pasar a la persona, no
 * hacerla esperar. La comprobación es una mejora, no un requisito de entrada.
 */
const MILISEGUNDOS_LIMITE = 1500;

/**
 * Comprueba si la contraseña aparece en filtraciones conocidas, usando la API
 * de rangos de Have I Been Pwned.
 *
 * K-anonimato: se calcula el SHA-1 de la contraseña y se envían SOLO los
 * primeros cinco caracteres del hash. El servicio devuelve todos los sufijos
 * que empiezan con ese prefijo (cientos de ellos) y la comparación se hace
 * acá. HIBP nunca ve la contraseña ni su hash completo, y no puede saber cuál
 * de los cientos de resultados era el que nos interesaba.
 *
 * Se usa SHA-1 porque es lo que exige el protocolo de ese servicio, no como
 * elección nuestra: las contraseñas se guardan con Argon2id, nunca con SHA-1.
 *
 * Ante cualquier problema devuelve false y deja continuar. Que un servicio de
 * terceros esté caído no puede impedir que alguien se registre.
 */
export async function estaFiltrada(contrasena: string): Promise<boolean> {
  if (!env.REVISAR_CONTRASENAS_FILTRADAS) {
    return false;
  }

  const hash = createHash("sha1").update(contrasena).digest("hex").toUpperCase();
  const prefijo = hash.slice(0, 5);
  const sufijo = hash.slice(5);

  try {
    const respuesta = await fetch(`${URL_RANGOS}${prefijo}`, {
      // Rellena la respuesta con resultados falsos para que su tamaño no
      // delate cuántas coincidencias reales tenía el prefijo.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(MILISEGUNDOS_LIMITE),
    });

    if (!respuesta.ok) {
      console.warn("HIBP respondió con estado", respuesta.status);
      return false;
    }

    return contieneSufijo(await respuesta.text(), sufijo);
  } catch (error) {
    // Se registra el hecho, como pide el diseño, para poder notar si el
    // servicio lleva mucho tiempo inalcanzable y la comprobación dejó de
    // aportar sin que nadie se entere.
    console.warn("No se pudo consultar HIBP; se continúa sin la comprobación:", error);
    return false;
  }
}

/**
 * El cuerpo llega como líneas "SUFIJO:CONTEO". Con el relleno activado vienen
 * sufijos con conteo cero, que hay que descartar: son ruido deliberado.
 */
function contieneSufijo(cuerpo: string, sufijo: string): boolean {
  for (const linea of cuerpo.split("\n")) {
    const [candidato, conteo] = linea.trim().split(":");

    if (candidato === sufijo) {
      return Number(conteo) > 0;
    }
  }

  return false;
}
