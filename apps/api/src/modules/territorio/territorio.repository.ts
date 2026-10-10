import { prisma } from "../../db.js";

/** Forma pública de una comuna: lo que necesita un selector, nada más. */
export const seleccionComuna = {
  id: true,
  nombre: true,
  region: { select: { id: true, nombre: true, orden: true } },
} as const;

/**
 * Todas las comunas con su región. Sin orderBy a propósito: el orden lo
 * decide el servicio con reglas del español (ver territorio.service.ts),
 * porque el ORDER BY de la base depende de la collation con que se creó, y
 * esa puede variar entre la base local y la de producción.
 */
export async function listarComunas() {
  return prisma.comuna.findMany({ select: seleccionComuna });
}

export async function existeComuna(id: number): Promise<boolean> {
  return (await prisma.comuna.count({ where: { id } })) > 0;
}
