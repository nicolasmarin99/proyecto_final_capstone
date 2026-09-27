export interface DetalleCampo {
  campo: string;
  mensaje: string;
}

/**
 * Error de dominio con una representación HTTP definida.
 * El manejador central de app.ts es el único que lo traduce a una respuesta,
 * de modo que los servicios no necesitan conocer Express.
 *
 * `detalles` permite que un rechazo decidido por reglas de negocio —una
 * contraseña que aparece en una filtración, por ejemplo— llegue al cliente con
 * la misma forma que un error de validación de Zod, y la web lo muestre bajo
 * el campo correspondiente sin tener que distinguir de dónde viene.
 */
export class ErrorHttp extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: DetalleCampo[] = [],
  ) {
    super(mensaje);
    this.name = "ErrorHttp";
  }
}
