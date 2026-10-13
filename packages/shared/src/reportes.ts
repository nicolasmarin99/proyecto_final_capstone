/**
 * Reglas de los reportes de servicios, compartidas por la API (que las
 * impone) y la web (que muestra los motivos y avisa antes de enviar).
 */

/** Motivos cerrados, en el orden en que se ofrecen. Iguales al enum motivo_denuncia. */
export const MOTIVOS_REPORTE = [
  "CONTENIDO_ENGANOSO",
  "IMAGENES_INAPROPIADAS",
  "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION",
  "SERVICIO_ILEGAL_O_PELIGROSO",
  "SUPLANTACION_DE_IDENTIDAD",
  "OTRO",
] as const;
export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number];

/** Con OTRO el comentario es obligatorio y tiene que decir algo: al menos esto. */
export const LARGO_MINIMO_COMENTARIO_OTRO = 10;
export const LARGO_MAXIMO_COMENTARIO_REPORTE = 500;

/** Reportes que una persona puede enviar en 24 horas. */
export const MAXIMO_REPORTES_POR_DIA = 5;

/**
 * Desde cuántas personas distintas un servicio pasa a prioridad alta en la
 * cola. Solo ordena la revisión: nunca oculta nada por sí mismo.
 */
export const PERSONAS_PRIORIDAD_ALTA = 3;

/** Largo del motivo con que un administrador desestima u oculta. */
export const LARGO_MINIMO_MOTIVO_DECISION = 10;
export const LARGO_MAXIMO_MOTIVO_DECISION = 500;
