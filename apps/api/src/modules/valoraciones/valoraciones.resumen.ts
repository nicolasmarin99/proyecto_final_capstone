import { CALIFICACION_MAXIMA, CALIFICACION_MINIMA, MINIMO_VALORACIONES_PARA_PROMEDIO } from "@localcl/shared";
import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";

/*
  ÚNICA definición del resumen de valoraciones de un prestador.

  - Solo cuentan las valoraciones PUBLICADAS: una OCULTA por moderación no
    entra en el conteo, ni en el promedio, ni en la distribución.
  - El promedio (con un decimal) y la distribución por estrella solo se
    entregan con MINIMO_VALORACIONES_PARA_PROMEDIO (3) o más publicadas. Con
    menos se entrega el conteo y nada más: un promedio de una sola reseña es
    la opinión de una persona presentada como reputación, y la distribución
    de una sola reseña la revela entera.

  Lo usan el buscador (tarjetas), la página del servicio y el perfil del
  prestador. La regla del mínimo vive en una sola función (aplicarMinimo);
  la suma y el conteo salen de SQL, en enteros, para que el redondeo se haga
  una vez y de la misma forma en todas partes.
*/

export interface ResumenCorto {
  cantidad: number;
  /** Con un decimal; null con menos de 3 valoraciones publicadas. */
  promedio: number | null;
}

export type Distribucion = Record<"1" | "2" | "3" | "4" | "5", number>;

export interface ResumenValoraciones extends ResumenCorto {
  /** Cuántas hay de cada estrella; null con menos de 3 valoraciones publicadas. */
  distribucion: Distribucion | null;
}

/** La regla del mínimo y el redondeo: suma y cantidad son enteros. */
function aplicarMinimo(cantidad: number, suma: number): ResumenCorto {
  if (cantidad < MINIMO_VALORACIONES_PARA_PROMEDIO) return { cantidad, promedio: null };
  // Un decimal, redondeando la mitad hacia arriba: 4,25 → 4,3.
  return { cantidad, promedio: Math.round((suma * 10) / cantidad) / 10 };
}

/**
 * Columnas para incrustar en el $queryRaw del buscador (alias de perfil `p`):
 * "valoracionesCantidad" y "valoracionesSuma". El buscador las pasa por
 * resumenCorto(); nunca calcula el promedio por su cuenta.
 */
export const columnasResumen = Prisma.sql`
  (SELECT count(*)::int FROM valoraciones v
    WHERE v.prestador_id = p.id AND v.estado = 'PUBLICADA')                         AS "valoracionesCantidad",
  (SELECT coalesce(sum(v.calificacion), 0)::int FROM valoraciones v
    WHERE v.prestador_id = p.id AND v.estado = 'PUBLICADA')                         AS "valoracionesSuma"`;

export function resumenCorto(cantidad: number, suma: number): ResumenCorto {
  return aplicarMinimo(cantidad, suma);
}

/** Resumen completo (con distribución) de un prestador. */
export async function resumenDe(prestadorId: string): Promise<ResumenValoraciones> {
  const filas = await prisma.$queryRaw<{ calificacion: number; cantidad: number }[]>`
    SELECT v.calificacion, count(*)::int AS cantidad
      FROM valoraciones v
     WHERE v.prestador_id = ${prestadorId} AND v.estado = 'PUBLICADA'
     GROUP BY v.calificacion`;

  const distribucion: Distribucion = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let cantidad = 0;
  let suma = 0;
  for (const fila of filas) {
    if (fila.calificacion < CALIFICACION_MINIMA || fila.calificacion > CALIFICACION_MAXIMA) continue;
    const estrella = String(fila.calificacion);
    if (estrella === "1" || estrella === "2" || estrella === "3" || estrella === "4" || estrella === "5") {
      distribucion[estrella] = fila.cantidad;
    }
    cantidad += fila.cantidad;
    suma += fila.calificacion * fila.cantidad;
  }

  const corto = aplicarMinimo(cantidad, suma);
  return { ...corto, distribucion: corto.promedio === null ? null : distribucion };
}
