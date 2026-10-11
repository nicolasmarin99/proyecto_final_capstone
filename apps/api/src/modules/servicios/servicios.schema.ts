import {
  LARGO_MAXIMO_DESCRIPCION_SERVICIO,
  LARGO_MAXIMO_TITULO,
  LARGO_MINIMO_DESCRIPCION_SERVICIO,
  LARGO_MINIMO_TITULO,
  PRECIO_MAXIMO,
} from "@localcl/shared";
import { z } from "zod";
import { UnidadPrecio } from "../../generated/prisma/client.js";

const precio = (campo: string) =>
  z
    .number({ error: `${campo} debe ser un número.` })
    .int(`${campo} va en pesos, sin decimales.`)
    .min(0, `${campo} no puede ser negativo.`)
    .max(PRECIO_MAXIMO, `${campo} es demasiado alto.`)
    .nullable()
    .optional();

/**
 * Datos de POST /servicios y PUT /servicios/:id (el PUT reemplaza el
 * servicio completo, así que pide lo mismo).
 *
 * No declara prestadorId: el dueño lo fija el servidor con el token.
 * El estado solo puede ser PUBLICADO o PAUSADO: OCULTO es una decisión de
 * moderación y BORRADOR no se usa todavía. Que quede PUBLICADO además
 * depende de los requisitos (ver servicios.service.ts).
 */
export const esquemaServicio = z
  .object({
    categoria: z.string({ error: "Elige una categoría." }).trim().min(1, "Elige una categoría.").max(60),
    titulo: z
      .string({ error: "El título es obligatorio." })
      .trim()
      .min(LARGO_MINIMO_TITULO, `El título debe tener al menos ${LARGO_MINIMO_TITULO} caracteres.`)
      .max(LARGO_MAXIMO_TITULO, `El título no puede superar los ${LARGO_MAXIMO_TITULO} caracteres.`),
    descripcion: z
      .string({ error: "La descripción es obligatoria." })
      .trim()
      .min(
        LARGO_MINIMO_DESCRIPCION_SERVICIO,
        `La descripción debe tener al menos ${LARGO_MINIMO_DESCRIPCION_SERVICIO} caracteres.`,
      )
      .max(
        LARGO_MAXIMO_DESCRIPCION_SERVICIO,
        `La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION_SERVICIO} caracteres.`,
      ),
    precioDesde: precio("El precio desde"),
    precioHasta: precio("El precio hasta"),
    unidadPrecio: z.enum(UnidadPrecio, { error: "Unidad de precio no válida." }).nullable().optional(),
    estado: z
      .enum(["PUBLICADO", "PAUSADO"], { error: "El estado debe ser PUBLICADO o PAUSADO." })
      .default("PUBLICADO"),
  })
  // Reglas entre campos. Son las mismas que imponen los CHECK de la base
  // (servicios_rango_precio, servicios_unidad_si_hay_precio): acá se
  // repiten para responder 400 con el campo exacto en vez de un 500.
  .superRefine((datos, contexto) => {
    const desde = datos.precioDesde ?? null;
    const hasta = datos.precioHasta ?? null;

    if (hasta !== null && desde === null) {
      contexto.addIssue({ code: "custom", path: ["precioHasta"], message: "Indica también el precio desde." });
    }

    if (desde !== null && hasta !== null && desde > hasta) {
      contexto.addIssue({
        code: "custom",
        path: ["precioHasta"],
        message: "El precio hasta no puede ser menor que el precio desde.",
      });
    }

    if (desde !== null && !datos.unidadPrecio) {
      contexto.addIssue({
        code: "custom",
        path: ["unidadPrecio"],
        message: "Indica cómo cobras: por servicio, por hora, por día…",
      });
    }
  })
  // Sin precio es «a convenir»: la unidad no significa nada y se descarta.
  .transform((datos) => {
    const precioDesde = datos.precioDesde ?? null;
    return {
      ...datos,
      precioDesde,
      precioHasta: datos.precioHasta ?? null,
      unidadPrecio: precioDesde === null ? null : (datos.unidadPrecio ?? null),
    };
  });

export type DatosServicio = z.infer<typeof esquemaServicio>;

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaId = z.object({ id: z.string().min(1).max(64) });
