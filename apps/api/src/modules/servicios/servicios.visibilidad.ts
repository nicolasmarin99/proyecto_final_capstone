import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";

/*
  ÚNICA definición de «servicio visible al público».

  Un servicio es visible si y solo si:
  - su estado es PUBLICADO (no pausado, oculto por moderación ni borrador), y
  - su prestador tiene la identidad verificada, la cuenta activa y no
    anonimizada.

  Todo camino público pasa por acá: el buscador (GET /servicios), la página
  del servicio (GET /servicios/:id), el contacto (GET /prestadores/:id/
  contacto) y los reportes (POST /servicios/:id/reportes). Si la regla
  cambia, cambia en este archivo y en ningún otro. La prueba
  servicios.visibilidad.test.ts recorre los estados posibles y exige que un
  servicio aparezca en el buscador si y solo si su página responde 200.

  Es SQL y no un `where` de Prisma porque el buscador es una consulta
  $queryRaw (texto completo con la columna generada): un fragmento SQL es lo
  único que pueden compartir las dos formas de consultar sin reescribir la
  regla en dos idiomas.
*/

/**
 * Condición SQL de visibilidad, para incrustar en una consulta $queryRaw.
 * Supone que la tabla servicios tiene el alias `s`; el resto lo resuelve con
 * su propia subconsulta, así no depende de qué otras tablas una la consulta.
 * No lleva valores del usuario: es texto fijo.
 */
export const condicionServicioVisible = Prisma.sql`(
  s.estado = 'PUBLICADO'
  AND EXISTS (
    SELECT 1
      FROM perfiles_prestador vis_p
      JOIN usuarios vis_u ON vis_u.id = vis_p.usuario_id
     WHERE vis_p.id = s.prestador_id
       AND vis_u.rut_verificado
       AND vis_u.activo
       AND vis_u.anonimizado_en IS NULL
  )
)`;

/** ¿Ese servicio es visible al público? Un id que no existe no lo es. */
export async function esServicioVisible(servicioId: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ visible: boolean }[]>`
    SELECT TRUE AS visible FROM servicios s WHERE s.id = ${servicioId} AND ${condicionServicioVisible}`;
  return filas.length > 0;
}

/** De esos ids, los que son visibles al público (para mostrarle al dueño cuáles se ven). */
export async function serviciosVisiblesEntre(servicioIds: string[]): Promise<Set<string>> {
  if (servicioIds.length === 0) return new Set();
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM servicios s WHERE s.id IN (${Prisma.join(servicioIds)}) AND ${condicionServicioVisible}`;
  return new Set(filas.map((fila) => fila.id));
}

/** Cuántos servicios visibles tiene un prestador (para el contacto sin servicio indicado). */
export async function contarServiciosVisiblesDe(prestadorId: string): Promise<number> {
  const [fila] = await prisma.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM servicios s WHERE s.prestador_id = ${prestadorId} AND ${condicionServicioVisible}`;
  return fila?.total ?? 0;
}

/** Ids de los servicios visibles de un prestador, los más recientes primero (para su perfil público). */
export async function serviciosVisiblesDe(prestadorId: string): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM servicios s
     WHERE s.prestador_id = ${prestadorId} AND ${condicionServicioVisible}
     ORDER BY s.creado_en DESC, s.id DESC`;
  return filas.map((fila) => fila.id);
}
