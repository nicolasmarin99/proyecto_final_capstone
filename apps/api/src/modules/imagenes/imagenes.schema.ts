import { LARGO_MAXIMO_MOTIVO_OCULTAR, LARGO_MINIMO_MOTIVO_OCULTAR, MAXIMO_IMAGENES_SERVICIO } from "@localcl/shared";
import { z } from "zod";
import { EstadoImagen } from "../../generated/prisma/client.js";

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdServicio = z.object({ id: z.string().min(1).max(64) });
export const esquemaIdsImagen = z.object({ id: z.string().min(1).max(64), imagenId: z.string().min(1).max(64) });
export const esquemaIdImagen = z.object({ id: z.string().min(1).max(64) });

/**
 * PUT /servicios/:id/imagenes/orden — { imagenes: ["id-1", "id-2", ...] }
 * La lista completa, en el orden nuevo. Que sean exactamente las del
 * servicio lo revisa el servicio contra la base.
 */
export const esquemaOrden = z.object({
  imagenes: z
    .array(z.string().min(1).max(64), { error: "Envía la lista de imágenes en el orden nuevo." })
    .min(1, "Envía la lista de imágenes en el orden nuevo.")
    .max(MAXIMO_IMAGENES_SERVICIO, `Un servicio tiene a lo más ${MAXIMO_IMAGENES_SERVICIO} imágenes.`)
    .refine((ids) => new Set(ids).size === ids.length, "Una imagen no puede repetirse en el orden."),
});

/** PATCH /admin/imagenes/:id/ocultar — el motivo queda registrado y lo ve el prestador. */
export const esquemaOcultar = z.object({
  motivo: z
    .string({ error: "Indica el motivo para ocultar la imagen." })
    .trim()
    .min(LARGO_MINIMO_MOTIVO_OCULTAR, `Explica el motivo en al menos ${LARGO_MINIMO_MOTIVO_OCULTAR} caracteres.`)
    .max(LARGO_MAXIMO_MOTIVO_OCULTAR, `El motivo no puede superar los ${LARGO_MAXIMO_MOTIVO_OCULTAR} caracteres.`),
});

/** GET /admin/imagenes?estado=VISIBLE&servicio=...&pagina=1&porPagina=20 */
export const esquemaListadoAdmin = z.object({
  estado: z.enum(EstadoImagen, { error: "Estado no válido." }).optional(),
  servicio: z.string().min(1).max(64).optional(),
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(20),
});

export type ListadoAdmin = z.infer<typeof esquemaListadoAdmin>;
