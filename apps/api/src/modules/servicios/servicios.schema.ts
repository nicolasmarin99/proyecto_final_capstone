import {
  LARGO_MAXIMO_CATEGORIA_PERSONALIZADA,
  LARGO_MAXIMO_CONSULTA,
  MAXIMO_POR_PAGINA_BUSQUEDA,
  ORDENES_BUSQUEDA,
  POR_PAGINA_BUSQUEDA,
  LARGO_MINIMO_CATEGORIA_PERSONALIZADA,
  SLUG_CATEGORIA_OTROS,
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
    // Solo cuenta con la categoría «Otros»; el largo se revisa abajo, porque
    // depende de qué categoría se eligió.
    categoriaPersonalizada: z.string({ error: "El nombre de tu oficio debe ser texto." }).trim().nullable().optional(),
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

    if (datos.categoria === SLUG_CATEGORIA_OTROS) {
      const largo = (datos.categoriaPersonalizada ?? "").length;

      if (largo < LARGO_MINIMO_CATEGORIA_PERSONALIZADA || largo > LARGO_MAXIMO_CATEGORIA_PERSONALIZADA) {
        contexto.addIssue({
          code: "custom",
          path: ["categoriaPersonalizada"],
          message: `Escribe el nombre de tu oficio (de ${LARGO_MINIMO_CATEGORIA_PERSONALIZADA} a ${LARGO_MAXIMO_CATEGORIA_PERSONALIZADA} caracteres).`,
        });
      }
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
      // Con cualquier categoría de la lista, el nombre libre no aplica: se
      // descarta para que no quede un «Pintura» colgando de «Gasfitería».
      categoriaPersonalizada:
        datos.categoria === SLUG_CATEGORIA_OTROS ? (datos.categoriaPersonalizada ?? null) : null,
      precioDesde,
      precioHasta: datos.precioHasta ?? null,
      unidadPrecio: precioDesde === null ? null : (datos.unidadPrecio ?? null),
    };
  });

export type DatosServicio = z.infer<typeof esquemaServicio>;

/** Ids de la URL. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaId = z.object({ id: z.string().min(1).max(64) });

/**
 * Un parámetro vacío de la URL (?comuna=) cuenta como ausente: es lo que
 * deja un formulario con el campo en blanco, no un error de quien busca.
 */
function opcional<T extends z.ZodType>(esquema: T) {
  return z.preprocess((valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor), esquema.optional());
}

/**
 * Filtros de GET /servicios, todos opcionales:
 * ?q=gasfiter&categoria=gasfiteria&comuna=13101&precioMax=50000&orden=precio&pagina=2&porPagina=12
 *
 * Un parámetro repetido (?q=a&q=b) llega como arreglo y no pasa: 400.
 */
export const esquemaBusqueda = z.object({
  q: opcional(
    z
      .string({ error: "La búsqueda debe ser texto." })
      .trim()
      .max(LARGO_MAXIMO_CONSULTA, `La búsqueda no puede superar los ${LARGO_MAXIMO_CONSULTA} caracteres.`),
  ),
  // Un slug: minúsculas, dígitos y guiones. Cualquier otra cosa no es una categoría.
  categoria: opcional(
    z
      .string({ error: "La categoría debe ser texto." })
      .trim()
      .max(60)
      .regex(/^[a-z0-9-]+$/, "La categoría no es válida."),
  ),
  comuna: opcional(z.coerce.number({ error: "La comuna no es válida." }).int("La comuna no es válida.").positive("La comuna no es válida.")),
  precioMax: opcional(
    z.coerce
      .number({ error: "El precio máximo debe ser un número." })
      .int("El precio máximo va en pesos, sin decimales.")
      .min(0, "El precio máximo no puede ser negativo.")
      .max(PRECIO_MAXIMO, "El precio máximo es demasiado alto."),
  ),
  orden: z.enum(ORDENES_BUSQUEDA, { error: "El orden debe ser recientes o precio." }).default("recientes"),
  pagina: z.coerce
    .number({ error: "La página debe ser un número." })
    .int("La página debe ser un número entero.")
    .min(1, "La página parte en 1.")
    // Más allá no hay nadie mirando, y un desplazamiento enorme es caro.
    .max(500, "La página no puede superar 500.")
    .default(1),
  porPagina: z.coerce
    .number({ error: "porPagina debe ser un número." })
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(MAXIMO_POR_PAGINA_BUSQUEDA, `porPagina no puede superar ${MAXIMO_POR_PAGINA_BUSQUEDA}.`)
    .default(POR_PAGINA_BUSQUEDA),
});

export type FiltrosBusqueda = z.infer<typeof esquemaBusqueda>;
