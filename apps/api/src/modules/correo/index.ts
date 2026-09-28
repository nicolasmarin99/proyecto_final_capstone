import { env } from "../../env.js";
import { EnviadorEnMemoria } from "./correo.memoria.js";
import { EnviadorSmtp } from "./correo.smtp.js";
import type { CorreoSaliente, EnviadorCorreo } from "./correo.tipos.js";

export type { CorreoSaliente, EnviadorCorreo } from "./correo.tipos.js";
export { EnviadorEnMemoria } from "./correo.memoria.js";

let instancia: EnviadorCorreo | null = null;

/**
 * Única puerta al transporte de correo. Se construye una vez y se reutiliza,
 * porque EnviadorSmtp mantiene un pool de conexiones y crear uno por envío
 * desperdiciaría la conexión en cada correo.
 *
 * El transporte de producción todavía no existe: ver correo.produccion.ts.
 */
export function obtenerEnviador(): EnviadorCorreo {
  instancia ??= env.CORREO_TRANSPORTE === "memoria" ? new EnviadorEnMemoria() : new EnviadorSmtp();

  return instancia;
}

/**
 * Envía sin dejar que un fallo del correo tumbe la operación que lo originó.
 *
 * Que el servidor de correo esté caído no puede impedir que alguien se
 * registre o restablezca su contraseña: el correo se reintenta o se reenvía,
 * la cuenta no se puede "medio crear". El detalle del fallo queda en el log
 * del servidor y nunca viaja al cliente, porque revelaría infraestructura y,
 * peor, permitiría distinguir un correo que sí existe de uno que no.
 */
export async function enviarSinInterrumpir(correo: CorreoSaliente): Promise<void> {
  try {
    await obtenerEnviador().enviar(correo);
  } catch (error) {
    console.error("No se pudo enviar el correo:", { asunto: correo.asunto }, error);
  }
}
