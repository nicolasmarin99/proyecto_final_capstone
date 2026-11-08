/**
 * Reglas de las certificaciones del prestador, compartidas por la API (que
 * las impone) y la web (que avisa antes de enviar).
 */

/** Tipo comodín: el prestador escribe el nombre y el emisor. */
export const CODIGO_CERTIFICACION_OTRA = "OTRA";

/** Número de registro, folio o código del certificado. */
export const LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION = 3;
export const LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION = 60;

/** Nombre y emisor de una «Otra certificación» (mismos límites que el CHECK de la base). */
export const LARGO_MINIMO_NOMBRE_CERTIFICACION = 3;
export const LARGO_MAXIMO_NOMBRE_CERTIFICACION = 120;

/** Envíos de certificaciones que un prestador puede hacer en 24 horas. */
export const MAXIMO_CERTIFICACIONES_POR_DIA = 5;

/** Largo del motivo con que un administrador rechaza una certificación. */
export const LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION = 10;
export const LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION = 500;
