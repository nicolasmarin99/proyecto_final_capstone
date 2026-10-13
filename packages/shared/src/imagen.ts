/**
 * Límites de las imágenes de un servicio, compartidos por la API (que los
 * impone) y la web (que avisa antes de subir).
 */

/** 5 MB: una foto de celular cabe de sobra; un archivo más grande no es una foto. */
export const TAMANO_MAXIMO_IMAGEN = 5 * 1024 * 1024;

/** Fotos por servicio. Más no ayudan a decidir y cargan la página. */
export const MAXIMO_IMAGENES_SERVICIO = 5;

/**
 * Formatos que la web ofrece en el selector. La API no confía en este dato
 * (lo escribe el navegador): decide el formato por los primeros bytes.
 */
export const TIPOS_IMAGEN_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Largo del motivo con que un administrador oculta una imagen. */
export const LARGO_MINIMO_MOTIVO_OCULTAR = 10;
export const LARGO_MAXIMO_MOTIVO_OCULTAR = 500;
