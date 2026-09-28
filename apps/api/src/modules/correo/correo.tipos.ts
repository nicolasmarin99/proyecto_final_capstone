/** Un correo listo para salir. Solo texto plano: ver correo.plantillas.ts. */
export interface CorreoSaliente {
  para: string;
  asunto: string;
  cuerpo: string;
}

/**
 * Puerto de salida para el correo.
 *
 * El resto de la aplicación depende de esta interfaz y nunca de un proveedor
 * concreto. Eso permite que las pruebas usen un doble en memoria sin levantar
 * nada, que el desarrollo use Mailpit, y que mañana se pueda cambiar de
 * proveedor tocando un solo archivo.
 *
 * enviar() no debe lanzar por fallos del proveedor: quien llama decide qué
 * hacer, y en esta aplicación un correo que no sale nunca puede tumbar la
 * operación que lo originó.
 */
export interface EnviadorCorreo {
  enviar(correo: CorreoSaliente): Promise<void>;
}
