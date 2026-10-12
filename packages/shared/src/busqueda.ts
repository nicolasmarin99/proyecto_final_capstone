/**
 * Límites de la búsqueda pública de servicios, compartidos por la API (que
 * los impone) y la web (que arma la URL y la paginación).
 */

/** Resultados por página si no se pide otra cantidad. Múltiplo de 2 y 3, para la grilla. */
export const POR_PAGINA_BUSQUEDA = 12;
/** Tope de resultados por página: nadie puede pedir el catálogo entero de una vez. */
export const MAXIMO_POR_PAGINA_BUSQUEDA = 20;

/** Largo máximo del texto libre. Más que esto no es una búsqueda, es un párrafo. */
export const LARGO_MAXIMO_CONSULTA = 100;

/** Comunas que se nombran en cada resultado; el resto va como un contador. */
export const COMUNAS_POR_RESULTADO = 3;

/** Órdenes posibles. «recientes» es el predeterminado. */
export const ORDENES_BUSQUEDA = ["recientes", "precio"] as const;
export type OrdenBusqueda = (typeof ORDENES_BUSQUEDA)[number];
