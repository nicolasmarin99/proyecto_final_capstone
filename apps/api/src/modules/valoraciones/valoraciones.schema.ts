import {
  CALIFICACION_MAXIMA,
  CALIFICACION_MINIMA,
  LARGO_MAXIMO_COMENTARIO_OBJECION,
  LARGO_MAXIMO_COMENTARIO_VALORACION,
  LARGO_MINIMO_COMENTARIO_OBJECION,
  LARGO_MINIMO_COMENTARIO_VALORACION,
  MOTIVOS_OBJECION,
  VALORACIONES_POR_PAGINA,
} from "@localcl/shared";
import { z } from "zod";

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdPrestador = z.object({ id: z.string().min(1).max(64) });
export const esquemaIdServicio = z.object({ id: z.string().min(1).max(64) });
export const esquemaIdValoracion = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /servicios/:id/valoraciones — { calificacion, comentario? }
 *
 * No declara cliente, servicio, contacto ni estado: Zod descarta lo que no
 * está declarado. Quién valora sale del token, a quién de la URL, y el
 * estado (PUBLICADA) lo fija el servidor.
 */
export const esquemaValoracion = z
  .object({
    calificacion: z
      .number({ error: "Elige de 1 a 5 estrellas." })
      .int("Elige de 1 a 5 estrellas.")
      .min(CALIFICACION_MINIMA, "Elige de 1 a 5 estrellas.")
      .max(CALIFICACION_MAXIMA, "Elige de 1 a 5 estrellas."),
    comentario: z
      .string({ error: "El comentario debe ser texto." })
      .trim()
      .max(LARGO_MAXIMO_COMENTARIO_VALORACION, `El comentario no puede superar los ${LARGO_MAXIMO_COMENTARIO_VALORACION} caracteres.`)
      .nullable()
      .optional(),
  })
  .superRefine((datos, contexto) => {
    // Opcional, pero si se escribe tiene que decir algo.
    if (datos.comentario && datos.comentario.length < LARGO_MINIMO_COMENTARIO_VALORACION) {
      contexto.addIssue({
        code: "custom",
        path: ["comentario"],
        message: `Si escribes un comentario, que tenga al menos ${LARGO_MINIMO_COMENTARIO_VALORACION} caracteres.`,
      });
    }
  })
  // Un comentario vacío es «sin comentario».
  .transform((datos) => ({ calificacion: datos.calificacion, comentario: datos.comentario ? datos.comentario : null }));

export type DatosValoracion = z.infer<typeof esquemaValoracion>;

/** GET /servicios/:id/valoraciones?pagina=1 y GET /prestadores/:id/valoraciones?pagina=1 */
export const esquemaPaginaValoraciones = z.object({
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(VALORACIONES_POR_PAGINA),
});

/** POST /valoraciones/:id/objecion — { motivo, comentario? }; con OTRO el comentario es obligatorio. */
export const esquemaObjecion = z
  .object({
    motivo: z.enum(MOTIVOS_OBJECION, { error: "Elige un motivo de la lista." }),
    comentario: z
      .string({ error: "El comentario debe ser texto." })
      .trim()
      .max(LARGO_MAXIMO_COMENTARIO_OBJECION, `El comentario no puede superar los ${LARGO_MAXIMO_COMENTARIO_OBJECION} caracteres.`)
      .nullable()
      .optional(),
  })
  .superRefine((datos, contexto) => {
    if (datos.motivo === "OTRO" && (datos.comentario ?? "").length < LARGO_MINIMO_COMENTARIO_OBJECION) {
      contexto.addIssue({
        code: "custom",
        path: ["comentario"],
        message: `Con «Otro», explica el problema en al menos ${LARGO_MINIMO_COMENTARIO_OBJECION} caracteres.`,
      });
    }
  })
  .transform((datos) => ({ motivo: datos.motivo, comentario: datos.comentario ? datos.comentario : null }));

export type DatosObjecion = z.infer<typeof esquemaObjecion>;
