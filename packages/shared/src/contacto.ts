/**
 * El mensaje con que un cliente abre WhatsApp desde la página de un servicio.
 *
 * Es el ÚNICO lugar donde se compone. La web lo usa para el enlace de wa.me
 * y para la vista previa bajo el botón, así lo que se muestra y lo que se
 * envía no pueden diferir. Vive en shared para que la app móvil use el mismo.
 */

/** «Juan Pérez Soto» → «Juan». Lo único del cliente que sale de LocalCL. */
export function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

export interface DatosMensajeContacto {
  /** Nombre público del prestador, el mismo que muestra la página. */
  nombrePrestador: string;
  tituloServicio: string;
  /**
   * El nombre de la cuenta con sesión, tal como viene (puede ser el
   * completo): aquí se recorta al nombre de pila. Nulo sin sesión.
   */
  nombreCliente?: string | null;
}

/**
 * Con sesión: «Hola Pedro Soto, soy Ana y te escribo desde LocalCL por tu
 * servicio «Gasfitería».». Sin sesión (o sin un nombre usable), el mensaje
 * de siempre, sin nombre.
 *
 * Recibe solo el nombre, nunca la cuenta entera: el correo y el RUT no
 * llegan a esta función, así que no pueden terminar en el mensaje.
 */
export function mensajeContactoWhatsApp({ nombrePrestador, tituloServicio, nombreCliente }: DatosMensajeContacto): string {
  const pila = nombreCliente ? nombreDePila(nombreCliente) : "";
  const presentacion = pila ? `, soy ${pila} y te escribo` : ", te escribo";
  return `Hola ${nombrePrestador}${presentacion} desde LocalCL por tu servicio «${tituloServicio}».`;
}
