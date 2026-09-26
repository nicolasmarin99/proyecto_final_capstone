import { prisma } from "../../db.js";
import type { Rol } from "../../generated/prisma/client.js";

/**
 * Agrupa en la base en vez de traer las filas y contarlas en Node: con muchos
 * usuarios, lo segundo movería toda la tabla por la red para descartarla.
 */
export async function contarUsuariosPorRol(): Promise<{ rol: Rol; total: number }[]> {
  const grupos = await prisma.usuario.groupBy({
    by: ["rol"],
    _count: { _all: true },
  });

  return grupos.map((grupo) => ({ rol: grupo.rol, total: grupo._count._all }));
}
