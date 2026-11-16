import { z } from "zod";

/** GET /admin/pendientes?pagina=1&porPagina=20 */
export const esquemaPendientes = z.object({
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(20),
});
