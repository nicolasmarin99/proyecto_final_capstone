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
 * enviar() SÍ puede lanzar si el proveedor falla: es la única forma de que el
 * motivo llegue al log del servidor. Lo que no puede pasar es que ese fallo
 * tumbe la operación que originó el correo, y de eso se encarga quien llama,
 * usando enviarSinInterrumpir() en vez de enviar() directamente.
 */
export interface EnviadorCorreo {
  enviar(correo: CorreoSaliente): Promise<void>;
}
