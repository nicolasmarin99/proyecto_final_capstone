import type { CorreoSaliente, EnviadorCorreo } from "./correo.tipos.js";

/**
 * Transporte de pruebas: no envía nada, acumula lo que se le pide enviar.
 *
 * Permite afirmar sobre el destinatario, el asunto y el enlace sin levantar un
 * servidor SMTP ni depender de la red, que es lo que haría lentas e inestables
 * las pruebas de integración.
 */
export class EnviadorEnMemoria implements EnviadorCorreo {
  private readonly bandeja: CorreoSaliente[] = [];

  async enviar(correo: CorreoSaliente): Promise<void> {
    this.bandeja.push(correo);
  }

  /** Todo lo enviado, en orden. */
  get enviados(): readonly CorreoSaliente[] {
    return this.bandeja;
  }

  /** Correos dirigidos a una dirección, comparando sin distinguir mayúsculas. */
  paraDireccion(direccion: string): CorreoSaliente[] {
    const buscada = direccion.trim().toLowerCase();

    return this.bandeja.filter((correo) => correo.para.trim().toLowerCase() === buscada);
  }

  /** El último correo enviado a una dirección, o null si no hay ninguno. */
  ultimoPara(direccion: string): CorreoSaliente | null {
    return this.paraDireccion(direccion).at(-1) ?? null;
  }

  vaciar(): void {
    this.bandeja.length = 0;
  }
}
