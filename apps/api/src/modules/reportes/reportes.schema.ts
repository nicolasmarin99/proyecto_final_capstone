import {
  LARGO_MAXIMO_COMENTARIO_REPORTE,
  LARGO_MAXIMO_MOTIVO_DECISION,
  LARGO_MINIMO_COMENTARIO_OTRO,
  LARGO_MINIMO_MOTIVO_DECISION,
  MOTIVOS_REPORTE,
} from "@localcl/shared";
import { z } from "zod";

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdServicio = z.object({ id: z.string().min(1).max(64) });
export const esquemaServicioAdmin = z.object({ servicioId: z.string().min(1).max(64) });

/**
 * POST /servicios/:id/reportes — { motivo, comentario? }
 * Con OTRO el comentario es obligatorio; con el resto, opcional.
 */
export const esquemaReporte = z
  .object({
    motivo: z.enum(MOTIVOS_REPORTE, { error: "Elige un motivo de la lista." }),
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
  // Un comentario vacío es «sin comentario».
  .transform((datos) => ({ motivo: datos.motivo, comentario: datos.comentario ? datos.comentario : null }));

export type DatosReporte = z.infer<typeof esquemaReporte>;

/** PATCH /admin/reportes/:servicioId/(desestimar|ocultar) — el motivo de la decisión es obligatorio. */
export const esquemaDecision = z.object({
  motivo: z
    .string({ error: "Indica el motivo de la decisión." })
    .trim()
    .min(LARGO_MINIMO_MOTIVO_DECISION, `Explica la decisión en al menos ${LARGO_MINIMO_MOTIVO_DECISION} caracteres.`)
    .max(LARGO_MAXIMO_MOTIVO_DECISION, `El motivo no puede superar los ${LARGO_MAXIMO_MOTIVO_DECISION} caracteres.`),
});

/** GET /admin/reportes?estado=pendientes|resueltos&pagina=1&porPagina=20 */
export const esquemaCola = z.object({
  estado: z.enum(["pendientes", "resueltos"], { error: "El estado debe ser pendientes o resueltos." }).default("pendientes"),
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(20),
});

export type FiltrosCola = z.infer<typeof esquemaCola>;
