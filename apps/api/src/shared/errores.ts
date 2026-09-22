/**
 * Error de dominio con una representación HTTP definida.
 * El manejador central de app.ts es el único que lo traduce a una respuesta,
 * de modo que los servicios no necesitan conocer Express.
 */
export class ErrorHttp extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorHttp";
  }
}
