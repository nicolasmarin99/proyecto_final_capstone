/**
 * Reglas de la foto de perfil, compartidas por la API (que las impone) y la
 * web (que avisa antes de subir o reportar).
 *
 * Cualquier cuenta (cliente, prestador o administrador) puede tener una. Se
 * publica al subirla, sin revisión previa: la moderación parte de un
 * reporte. El tamaño y los formatos son los mismos que los de las fotos de
 * un servicio (TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN_PERMITIDOS).
 */

/**
 * Motivos con que se reporta una foto de perfil, en el orden en que se
 * ofrecen. Son un subconjunto del enum motivo_denuncia (CHECK
 * denuncias_motivo_segun_objeto): los de un servicio o una valoración no
 * describen una foto.
 */
export const MOTIVOS_REPORTE_FOTO = [
  "IMAGENES_INAPROPIADAS",
  "SUPLANTACION_DE_IDENTIDAD",
  "DATOS_PERSONALES_EXPUESTOS",
  "OTRO",
] as const;
export type MotivoReporteFoto = (typeof MOTIVOS_REPORTE_FOTO)[number];

/**
 * Fotos de perfil que una cuenta puede subir en 24 horas. Cambiarla es
 * normal; cambiarla cien veces al día no, y cada subida ocupa el proveedor.
 * Las retiradas por moderación también cuentan.
 */
export const MAXIMO_FOTOS_PERFIL_POR_DIA = 10;
