import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * La versión que rige hoy: la de vigenteDesde más reciente que ya llegó.
 * Una versión con fecha futura queda publicada pero todavía no rige.
 */
export async function versionVigente() {
  return prisma.versionTerminos.findFirst({
    where: { vigenteDesde: { lte: new Date() } },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true, version: true, vigenteDesde: true, contenido: true },
  });
}

/**
 * ¿A esta cuenta le falta aceptar la versión vigente? Una sola consulta,
 * porque corre en cada petición con sesión (middlewares/autenticar.ts).
 *
 * Solo para cuentas que existen y están activas: a una cuenta eliminada o
 * suspendida no se le piden términos, se la rechaza con 401 (autorizar y
 * /auth/yo). Sin versión vigente (una base sin maestros) no hay nada que
 * aceptar. En ambos casos no hay filas y la respuesta es false.
 */
export async function tieneTerminosPendientes(usuarioId: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ pendiente: boolean }[]>`
    SELECT a.usuario_id IS NULL AS pendiente
      FROM usuarios u
     CROSS JOIN (SELECT id FROM versiones_terminos WHERE vigente_desde <= now() ORDER BY vigente_desde DESC LIMIT 1) v
      LEFT JOIN aceptaciones_terminos a ON a.version_id = v.id AND a.usuario_id = u.id
     WHERE u.id = ${usuarioId} AND u.activo`;
  return filas[0]?.pendiente ?? false;
}

/**
 * Registra la aceptación. Si ya existía (dos pestañas que aceptan a la vez),
 * no se toca: la fecha que vale es la primera.
 */
export async function registrarAceptacion(usuarioId: string, versionId: string): Promise<void> {
  try {
    await prisma.aceptacionTerminos.create({ data: { usuarioId, versionId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}
