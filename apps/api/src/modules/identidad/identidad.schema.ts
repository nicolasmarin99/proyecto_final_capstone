import { z } from "zod";
import { EstadoCredencial } from "../../generated/prisma/client.js";

/** Cola de revisión: GET /admin/identidades?estado=PENDIENTE&pagina=1&porPagina=20 */
export const esquemaConsultaCola = z.object({
  estado: z.enum(EstadoCredencial, { error: "Estado no válido." }).default(EstadoCredencial.PENDIENTE),
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    // Tope para que nadie pida la tabla entera de una vez.
    .max(50, "porPagina no puede superar 50.")
    .default(20),
});

export type ConsultaCola = z.infer<typeof esquemaConsultaCola>;

/**
 * El id de la URL. No se exige formato UUID: un id con otra forma
 * simplemente no existe, y responder 404 es más honesto que 400.
 */
export const esquemaIdIdentidad = z.object({
  id: z.string().min(1).max(64),
});

/**
 * El motivo es obligatorio y con contenido: el prestador lo lee para saber
 * qué corregir. La base además lo exige con el CHECK credenciales_rechazo_con_motivo.
 */
export const esquemaRechazo = z.object({
  motivo: z
    .string({ error: "Indica el motivo del rechazo." })
    .trim()
    .min(10, "Explica el motivo en al menos 10 caracteres, para que el prestador sepa qué corregir.")
    .max(500, "El motivo no puede superar los 500 caracteres."),
});
