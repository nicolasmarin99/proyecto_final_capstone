import type { Categoria, Precio, UnidadPrecio } from "../api/cliente";

export const NOMBRE_UNIDAD: Record<UnidadPrecio, string> = {
  POR_SERVICIO: "por servicio",
  POR_HORA: "por hora",
  POR_DIA: "por día",
  POR_METRO_CUADRADO: "por m²",
  POR_PERSONA: "por persona",
};

/**
 * El nombre de la categoría que se muestra: con «Otros», el oficio que
 * escribió el prestador; con cualquier otra, el nombre de la lista.
 */
export function nombreCategoria(servicio: { categoria: Categoria; categoriaPersonalizada: string | null }): string {
  return servicio.categoriaPersonalizada ?? servicio.categoria.nombre;
}

const pesos = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

/**
 * El precio como se muestra: "$25.000 – $60.000 por servicio",
 * "Desde $25.000 por hora" o "A convenir" si no hay precio.
 */
export function textoPrecio({ precioDesde, precioHasta, unidadPrecio }: Precio): string {
  if (precioDesde === null) {
    return "A convenir";
  }

  const unidad = unidadPrecio ? ` ${NOMBRE_UNIDAD[unidadPrecio]}` : "";

  if (precioHasta === null || precioHasta === precioDesde) {
    return `${precioHasta === null ? "Desde " : ""}${pesos.format(precioDesde)}${unidad}`;
  }

  return `${pesos.format(precioDesde)} – ${pesos.format(precioHasta)}${unidad}`;
}
