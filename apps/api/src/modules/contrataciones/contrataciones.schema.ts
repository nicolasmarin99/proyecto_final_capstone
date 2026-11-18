import {
  CONTRATACIONES_POR_PAGINA,
  FECHA_MINIMA_CONTRATACION,
  LARGO_MAXIMO_NOTAS_CONTRATACION,
  esFechaCalendario,
  fechaDeHoyEnChile,
} from "@localcl/shared";
import { z } from "zod";

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdContratacion = z.object({ id: z.string().min(1).max(64) });
export const esquemaIdServicio = z.object({ servicioId: z.string().min(1).max(64) });

/**
 * La fecha en que se contrató, «AAAA-MM-DD». No puede ser futura: «hoy» es
 * hoy en Chile (fechaDeHoyEnChile). El CHECK contrataciones_fecha_no_futura
 * de la base impone lo mismo, con la misma zona horaria.
 */
const fechaContratacion = z
  .string({ error: "Indica la fecha en que lo contrataste." })
  .refine(esFechaCalendario, "La fecha no es válida.")
  // Las comparaciones de texto funcionan porque el formato es AAAA-MM-DD.
  .refine((fecha) => fecha <= fechaDeHoyEnChile(), "La fecha no puede ser futura.")
  .refine((fecha) => fecha >= FECHA_MINIMA_CONTRATACION, "Revisa el año de la fecha.");

const notas = z
  .string({ error: "Las notas deben ser texto." })
  .trim()
  .max(LARGO_MAXIMO_NOTAS_CONTRATACION, `Las notas no pueden superar los ${LARGO_MAXIMO_NOTAS_CONTRATACION} caracteres.`)
  .nullable()
  // Notas vacías son «sin notas».
  .transform((texto) => (texto ? texto : null));

/**
 * POST /contrataciones — { servicioId, fechaContratacion, notas? }
 *
 * No declara cliente, prestador ni las copias del título y del nombre: Zod
 * descarta lo que no está declarado. Quién registra sale del token; el
 * prestador y las copias, del servicio en la base.
 */
export const esquemaCrearContratacion = z.object({
  servicioId: z.string({ error: "Indica el servicio." }).min(1, "Indica el servicio.").max(64),
  fechaContratacion,
  notas: notas.optional().transform((texto) => texto ?? null),
});

export type DatosCrearContratacion = z.infer<typeof esquemaCrearContratacion>;

/** PATCH /contrataciones/:id — solo la fecha y las notas, al menos una. */
export const esquemaEditarContratacion = z
  .object({ fechaContratacion: fechaContratacion.optional(), notas: notas.optional() })
  .refine((datos) => datos.fechaContratacion !== undefined || datos.notas !== undefined, "Indica la fecha o las notas que quieres cambiar.");

export type DatosEditarContratacion = z.infer<typeof esquemaEditarContratacion>;

/** GET /contrataciones?pagina=1&porPagina=10 */
export const esquemaPaginaContrataciones = z.object({
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(CONTRATACIONES_POR_PAGINA),
});
