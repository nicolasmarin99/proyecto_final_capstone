import { env } from "../../env.js";
import type { CorreoSaliente, EnviadorCorreo } from "./correo.tipos.js";

/**
 * Transporte de producción: API HTTP de Brevo.
 *
 * Se eligió una API HTTP y no SMTP por dos razones. La primera es que varios
 * servicios de hosting bloquean los puertos SMTP salientes para frenar spam, y
 * un adaptador correcto igual no entregaría nada. La segunda es que una
 * respuesta HTTP trae un código y un mensaje concretos cuando algo falla,
 * mientras que un fallo de SMTP suele ser un tiempo de espera agotado sin
 * explicación.
 *
 * Tampoco hizo falta una dependencia nueva: basta el fetch nativo de Node.
 *
 * SOBRE LA ENTREGA A GMAIL Y OUTLOOK. Que el código funcione no basta para que
 * el correo llegue a la bandeja de entrada. Quien recibe comprueba que el
 * dominio del remitente autorice a quien envía, mediante SPF y DKIM. Mientras
 * el remitente sea una dirección verificada de forma individual en el
 * proveedor, el correo sale firmado por el dominio del proveedor y no por el
 * del remitente, así que puede terminar en spam. La solución definitiva es un
 * dominio propio con SPF, DKIM y DMARC; hasta entonces esto es un compromiso
 * consciente, no un descuido.
 */

const URL_ENVIO = "https://api.brevo.com/v3/smtp/email";

/** Mismo criterio que en SMTP: quien llama está dentro de una petición HTTP. */
const MILISEGUNDOS_LIMITE = 5000;

/**
 * CORREO_REMITENTE viene como "LocalCL <no-responder@ejemplo.cl>" o como una
 * dirección pelada. La API necesita el nombre y el correo por separado.
 */
export function partirRemitente(valor: string): { nombre: string; correo: string } {
  const conNombre = /^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/.exec(valor);

  if (conNombre?.[2]) {
    return { nombre: conNombre[1]?.trim() || "LocalCL", correo: conNombre[2] };
  }

  return { nombre: "LocalCL", correo: valor.trim() };
}

export class EnviadorProduccion implements EnviadorCorreo {
  async enviar(correo: CorreoSaliente): Promise<void> {
    const remitente = partirRemitente(env.CORREO_REMITENTE);

    const respuesta = await fetch(URL_ENVIO, {
      method: "POST",
      headers: {
        "api-key": env.CORREO_API_CLAVE,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: remitente.nombre, email: remitente.correo },
        to: [{ email: correo.para }],
        subject: correo.asunto,
        textContent: correo.cuerpo,
      }),
      signal: AbortSignal.timeout(MILISEGUNDOS_LIMITE),
    });

    if (!respuesta.ok) {
      // Se incluye la respuesta del proveedor porque es lo que permite
      // distinguir una clave inválida de un remitente sin verificar. Nunca
      // se registra el cuerpo del correo: lleva enlaces de un solo uso.
      throw new Error(
        `Brevo rechazó el envío (${respuesta.status}): ${await respuesta.text()}`,
      );
    }
  }
}
