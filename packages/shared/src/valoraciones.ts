/**
 * Reglas de las valoraciones de prestadores, compartidas por la API (que
 * las impone) y la web (que las muestra y avisa antes de enviar).
 */

/** Calificación en estrellas (mismos límites que el CHECK de la base). */
export const CALIFICACION_MINIMA = 1;
export const CALIFICACION_MAXIMA = 5;

/** Comentario opcional; si se escribe, entre estos largos (también un CHECK de la base). */
export const LARGO_MINIMO_COMENTARIO_VALORACION = 10;
export const LARGO_MAXIMO_COMENTARIO_VALORACION = 1000;

/** Días desde el último contacto en que se puede valorar (o editar la valoración). */
export const DIAS_PARA_VALORAR = 60;

/**
 * Valoraciones publicadas necesarias para mostrar el promedio y la
 * distribución. Con menos, un promedio sería la opinión de una o dos
 * personas presentada como reputación.
 */
export const MINIMO_VALORACIONES_PARA_PROMEDIO = 3;

/** Valoraciones por página en la lista pública. */
export const VALORACIONES_POR_PAGINA = 10;

/** Motivos cerrados con que un prestador objeta una valoración. Iguales al enum motivo_denuncia. */
export const MOTIVOS_OBJECION = [
  "LENGUAJE_OFENSIVO",
  "INFORMACION_FALSA",
  "DATOS_PERSONALES_EXPUESTOS",
  "NO_CORRESPONDE_A_UN_SERVICIO",
  "OTRO",
] as const;
export type MotivoObjecion = (typeof MOTIVOS_OBJECION)[number];

/** Comentario de una objeción: obligatorio con OTRO. */
export const LARGO_MINIMO_COMENTARIO_OBJECION = 10;
export const LARGO_MAXIMO_COMENTARIO_OBJECION = 500;
