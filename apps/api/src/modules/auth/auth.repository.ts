import { prisma } from "../../db.js";
import { Rol, type TipoToken } from "../../generated/prisma/client.js";

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
  rut: true,
  rutVerificado: true,
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

/** El rol y el estado del RUT los fija el servidor, nunca el cliente. */
export async function crearPrestador(datos: {
  nombre: string;
  correo: string;
  hashContrasena: string;
  rut: string;
}) {
  return prisma.usuario.create({
    data: {
      ...datos,
      rol: Rol.PRESTADOR,
      // Se guarda explícitamente en false aunque ese sea el valor por defecto
      // del esquema, porque aquí la distinción importa: el RUT está bien
      // formado (pasó el módulo 11), pero nadie ha comprobado todavía que
      // pertenezca a esta persona. Acreditarlo contra los registros oficiales
      // es un paso posterior, y hasta que ocurra el prestador no debería
      // aparecer como validado en la plataforma.
      rutVerificado: false,
    },
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

/** Trae el hash para comprobar la contraseña actual en un cambio con sesión. */
export async function buscarCredencialesPorId(id: string) {
  return prisma.usuario.findUnique({
    where: { id },
    select: { ...camposPublicos, hashContrasena: true },
  });
}

export async function actualizarHashContrasena(usuarioId: string, hashContrasena: string) {
  await prisma.usuario.update({ where: { id: usuarioId }, data: { hashContrasena } });
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
 * Cierra las demás sesiones y deja viva la que hizo la petición.
 *
 * Si hashTokenActual es null (una petición sin cookie de refresco), no hay
 * nada que preservar y se cierran todas: es el resultado seguro por defecto.
 */
export async function revocarSesionesSalvo(usuarioId: string, hashTokenActual: string | null) {
  await prisma.sesion.updateMany({
    where: {
      usuarioId,
      revocadaEn: null,
      ...(hashTokenActual ? { hashToken: { not: hashTokenActual } } : {}),
    },
    data: { revocadaEn: new Date() },
  });
}

export async function marcarCorreoVerificado(usuarioId: string) {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { correoVerificado: true },
  });
}

export async function crearTokenCuenta(datos: {
  usuarioId: string;
  tipo: TipoToken;
  hashToken: string;
  expiraEn: Date;
}) {
  return prisma.tokenCuenta.create({ data: datos, select: { id: true } });
}

/**
 * Busca filtrando además por tipo: así un token de verificación presentado en
 * el endpoint de restablecer contraseña simplemente no se encuentra, en vez de
 * encontrarse y depender de una comprobación posterior que alguien pueda
 * olvidar. Es lo que hace segura la decisión de usar una sola tabla.
 */
export async function buscarTokenCuenta(hashToken: string, tipo: TipoToken) {
  return prisma.tokenCuenta.findFirst({
    where: { hashToken, tipo },
    select: { id: true, usuarioId: true, expiraEn: true, usadoEn: true },
  });
}

/** updateMany: no falla si otra petición alcanzó a consumirlo primero. */
export async function marcarTokenUsado(id: string) {
  const resultado = await prisma.tokenCuenta.updateMany({
    where: { id, usadoEn: null },
    data: { usadoEn: new Date() },
  });

  // Cuántas filas cambiaron decide quién gana la carrera entre dos canjes
  // simultáneos del mismo enlace: solo una ve count 1.
  return resultado.count === 1;
}

/** Al emitir un token nuevo se queman los anteriores del mismo propósito. */
export async function invalidarTokensPendientes(usuarioId: string, tipo: TipoToken) {
  await prisma.tokenCuenta.updateMany({
    where: { usuarioId, tipo, usadoEn: null },
    data: { usadoEn: new Date() },
  });
}

/** Momento en que se emitió el último token de ese tipo, para frenar reenvíos. */
export async function ultimoTokenEmitido(usuarioId: string, tipo: TipoToken) {
  return prisma.tokenCuenta.findFirst({
    where: { usuarioId, tipo },
    orderBy: { creadoEn: "desc" },
    select: { creadoEn: true },
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
