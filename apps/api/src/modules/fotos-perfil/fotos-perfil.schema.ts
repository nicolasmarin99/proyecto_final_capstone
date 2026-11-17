import { LARGO_MAXIMO_COMENTARIO_REPORTE, LARGO_MINIMO_COMENTARIO_OTRO, MOTIVOS_REPORTE_FOTO } from "@localcl/shared";
import { z } from "zod";

/** Id de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdFoto = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /fotos-perfil/:id/reportes — { motivo, comentario? }
 * Las mismas reglas que el reporte de un servicio, con los motivos de una
 * foto: con OTRO el comentario es obligatorio.
 */
export const esquemaReporteFoto = z
  .object({
    motivo: z.enum(MOTIVOS_REPORTE_FOTO, { error: "Elige un motivo de la lista." }),
    comentario: z
      .string({ error: "El comentario debe ser texto." })
      .trim()
      .max(LARGO_MAXIMO_COMENTARIO_REPORTE, `El comentario no puede superar los ${LARGO_MAXIMO_COMENTARIO_REPORTE} caracteres.`)
      .nullable()
      .optional(),
  })
  .superRefine((datos, contexto) => {
    if (datos.motivo === "OTRO" && (datos.comentario ?? "").length < LARGO_MINIMO_COMENTARIO_OTRO) {
      contexto.addIssue({
        code: "custom",
        path: ["comentario"],
        message: `Con «Otro», cuéntanos qué pasa en al menos ${LARGO_MINIMO_COMENTARIO_OTRO} caracteres.`,
      });
    }
  })
  .transform((datos) => ({ motivo: datos.motivo, comentario: datos.comentario ? datos.comentario : null }));

export type DatosReporteFoto = z.infer<typeof esquemaReporteFoto>;

/** GET /admin/fotos-perfil?pagina=1&porPagina=20 */
export const esquemaListadoFotos = z.object({
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(20),
});

export type ListadoFotos = z.infer<typeof esquemaListadoFotos>;
