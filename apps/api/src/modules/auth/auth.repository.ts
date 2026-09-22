import { prisma } from "../../db.js";
import { Rol } from "../../generated/prisma/client.js";

/**
 * Campos de un usuario que la API puede exponer.
 * hashContrasena queda fuera a propósito: con un select explícito el hash
 * no sale de la base ni siquiera por descuido de una capa superior.
 */
const camposPublicos = {
  id: true,
  correo: true,
  nombre: true,
  rol: true,
  correoVerificado: true,
  activo: true,
  creadoEn: true,
} as const;

/** Única capa que habla con Prisma. El rol lo fija el servidor, no el cliente. */
export async function crearCliente(datos: {
  nombre: string;
  correo: string;
  hashContrasena: string;
}) {
  return prisma.usuario.create({
    data: { ...datos, rol: Rol.CLIENTE },
    select: camposPublicos,
  });
}

/**
 * Única consulta que trae el hash, porque el login necesita compararlo.
 * El servicio lo descarta antes de devolver nada hacia arriba.
 */
export async function buscarCredencialesPorCorreo(correo: string) {
  return prisma.usuario.findUnique({
    where: { correo },
    select: { ...camposPublicos, hashContrasena: true },
  });
}

export async function buscarUsuarioPublicoPorId(id: string) {
  return prisma.usuario.findUnique({ where: { id }, select: camposPublicos });
}

export async function crearSesion(datos: {
  usuarioId: string;
  hashToken: string;
  expiraEn: Date;
  agenteUsuario: string | null;
}) {
  return prisma.sesion.create({ data: datos, select: { id: true } });
}

export async function buscarSesionPorHash(hashToken: string) {
  return prisma.sesion.findUnique({
    where: { hashToken },
    select: { id: true, usuarioId: true, expiraEn: true, revocadaEn: true },
  });
}

/** updateMany y no update: no falla si la sesión no existe o ya estaba revocada. */
export async function revocarSesionPorHash(hashToken: string) {
  await prisma.sesion.updateMany({
    where: { hashToken, revocadaEn: null },
    data: { revocadaEn: new Date() },
  });
}

export async function revocarSesionesDeUsuario(usuarioId: string) {
  await prisma.sesion.updateMany({
    where: { usuarioId, revocadaEn: null },
    data: { revocadaEn: new Date() },
  });
}

/**
 * Rotación en una transacción: o quedan la sesión nueva y la anterior marcada
 * como reemplazada, o no queda ninguna de las dos cosas. Si se hicieran por
 * separado y fallara la segunda escritura, el usuario terminaría con dos
 * sesiones válidas y se perdería el rastro de la cadena.
 */
export async function rotarSesion(datos: {
  sesionAnteriorId: string;
  usuarioId: string;
  hashToken: string;
  expiraEn: Date;
  agenteUsuario: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const nueva = await tx.sesion.create({
      data: {
        usuarioId: datos.usuarioId,
        hashToken: datos.hashToken,
        expiraEn: datos.expiraEn,
        agenteUsuario: datos.agenteUsuario,
      },
      select: { id: true },
    });

    await tx.sesion.update({
      where: { id: datos.sesionAnteriorId },
      data: { revocadaEn: new Date(), reemplazadaPor: nueva.id },
    });

    return nueva;
  });
}
