/**
 * Límites del documento de identidad, compartidos por la API (que los impone
 * leyendo los bytes del archivo) y la web (que avisa antes de enviar).
 */

export const TAMANO_MAXIMO_DOCUMENTO = 5 * 1024 * 1024;

/** Para el atributo accept del selector y la revisión previa en el navegador. */
export const TIPOS_DOCUMENTO_PERMITIDOS = ["image/jpeg", "image/png", "application/pdf"] as const;
