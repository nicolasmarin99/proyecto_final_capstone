import { createTransport, type Transporter } from "nodemailer";
import { env } from "../../env.js";
import type { CorreoSaliente, EnviadorCorreo } from "./correo.tipos.js";

/**
 * Tope de espera del envío. Existe porque quien llama a enviar() está dentro
 * de una petición HTTP: sin un límite, un servidor SMTP que no responde
 * dejaría colgado el registro de un usuario hasta que el socket expire solo.
 */
const MILISEGUNDOS_LIMITE = 5000;

/**
 * Transporte de desarrollo, contra el Mailpit de docker-compose.
 *
 * Sin TLS ni autenticación a propósito: Mailpit corre en la máquina de quien
 * desarrolla y no entrega nada al exterior. Un proveedor real necesita las dos
 * cosas, y por eso no se reutiliza esta clase para producción.
 */
export class EnviadorSmtp implements EnviadorCorreo {
  private readonly transporte: Transporter;

  constructor() {
    this.transporte = createTransport({
      host: env.CORREO_SMTP_HOST,
      port: env.CORREO_SMTP_PUERTO,
      secure: false,
      connectionTimeout: MILISEGUNDOS_LIMITE,
      greetingTimeout: MILISEGUNDOS_LIMITE,
      socketTimeout: MILISEGUNDOS_LIMITE,
    });
  }

  async enviar(correo: CorreoSaliente): Promise<void> {
    await this.transporte.sendMail({
      from: env.CORREO_REMITENTE,
      to: correo.para,
      subject: correo.asunto,
      text: correo.cuerpo,
    });
  }
}
