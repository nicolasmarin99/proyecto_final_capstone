/**
 * Límites de un servicio publicado, compartidos por la API (que los impone)
 * y la web (que muestra contadores y avisa antes de enviar).
 */

export const LARGO_MINIMO_TITULO = 10;
export const LARGO_MAXIMO_TITULO = 120;

export const LARGO_MINIMO_DESCRIPCION_SERVICIO = 30;
export const LARGO_MAXIMO_DESCRIPCION_SERVICIO = 2000;

/**
 * Tope de precio en pesos. La columna es un entero de 32 bits (hasta unos
 * 2.100 millones); mil millones deja margen y ningún servicio del hogar se
 * acerca.
 */
export const PRECIO_MAXIMO = 1_000_000_000;

export const MINIMO_COMUNAS_ATENCION = 1;
export const MAXIMO_COMUNAS_ATENCION = 20;
