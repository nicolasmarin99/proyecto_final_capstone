/**
 * Límites del perfil de prestador, compartidos por la API (que los impone)
 * y la web (que los muestra: el contador de la descripción, el mínimo y el
 * máximo del radio). Si cambian aquí, cambian en los dos lados a la vez.
 */

/** Menos de 20 caracteres no alcanza para decir qué haces y dónde. */
export const LARGO_MINIMO_DESCRIPCION = 20;
export const LARGO_MAXIMO_DESCRIPCION = 1000;

/** El mismo rango que impone el CHECK perfiles_prestador_radio_rango. */
export const RADIO_MINIMO_KM = 1;
export const RADIO_MAXIMO_KM = 200;
