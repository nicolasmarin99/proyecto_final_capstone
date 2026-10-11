import { prisma } from "../../db.js";
import { seleccionComuna } from "../territorio/territorio.repository.js";
import type { DatosPerfilPrestador } from "./prestadores.schema.js";

/**
 * Lo que se devuelve del perfil. La ubicación no aparece: es una columna
 * geography que Prisma no puede leer, y todavía no se pide. Cuando llegue la
 * geocodificación se leerá con $queryRaw.
 */
const seleccionPerfil = {
  id: true,
  descripcion: true,
  telefono: true,
  radioAtencionKm: true,
  comuna: { select: seleccionComuna },
  comunasAtencion: { select: { comuna: { select: seleccionComuna } } },
  creadoEn: true,
  actualizadoEn: true,
} as const;

export async function buscarPerfilPorUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: seleccionPerfil });
}

export async function existePerfil(usuarioId: string): Promise<boolean> {
  return (await prisma.perfilPrestador.count({ where: { usuarioId } })) > 0;
}

/**
 * Crea o actualiza el perfil del usuario. Se busca por usuarioId, que es
 * UNIQUE en la base: un prestador nunca puede quedar con dos perfiles.
 *
 * El update enumera los campos que cambia en vez de pasar el objeto entero:
 * así la ubicación, que no está entre ellos, sobrevive a cada edición.
 */
export async function guardarPerfil(usuarioId: string, datos: DatosPerfilPrestador) {
  const campos = {
    descripcion: datos.descripcion,
    telefono: datos.telefono,
    comunaId: datos.comunaId,
    radioAtencionKm: datos.radioAtencionKm,
  };

  return prisma.perfilPrestador.upsert({
    where: { usuarioId },
    create: { usuarioId, ...campos },
    update: campos,
    select: seleccionPerfil,
  });
}

export async function buscarIdPerfil(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: { id: true } });
}

export async function contarComunasExistentes(ids: number[]) {
  return prisma.comuna.count({ where: { id: { in: ids } } });
}

/**
 * Reemplaza las comunas de atención en una transacción: si algo falla, el
 * prestador conserva las que tenía en vez de quedar sin ninguna.
 */
export async function reemplazarComunasAtencion(prestadorId: string, comunaIds: number[]) {
  return prisma.$transaction(async (tx) => {
    await tx.prestadorComuna.deleteMany({ where: { prestadorId } });
    await tx.prestadorComuna.createMany({ data: comunaIds.map((comunaId) => ({ prestadorId, comunaId })) });

    return tx.comuna.findMany({ where: { id: { in: comunaIds } }, select: seleccionComuna });
  });
}

/**
 * Lo que hace falta para entregar el contacto: de quién es el perfil, su
 * teléfono y cuántos servicios publicados tiene.
 */
export async function buscarPrestadorParaContacto(prestadorId: string) {
  return prisma.perfilPrestador.findUnique({
    where: { id: prestadorId },
    select: {
      usuarioId: true,
      telefono: true,
      _count: { select: { servicios: { where: { estado: "PUBLICADO" } } } },
    },
  });
}

export async function buscarServicioParaContacto(servicioId: string) {
  return prisma.servicio.findUnique({ where: { id: servicioId }, select: { prestadorId: true, estado: true } });
}

export async function registrarContacto(datos: { clienteId: string; prestadorId: string; servicioId: string | null }) {
  await prisma.contacto.create({ data: { ...datos, canal: "WHATSAPP" } });
}
