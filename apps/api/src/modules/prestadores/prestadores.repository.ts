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
 * Lo que hace falta para entregar el contacto: de quién es el perfil y su
 * teléfono. Si tiene servicios visibles lo decide servicios.visibilidad.ts.
 */
export async function buscarPrestadorParaContacto(prestadorId: string) {
  return prisma.perfilPrestador.findUnique({
    where: { id: prestadorId },
    select: { usuarioId: true, telefono: true },
  });
}

export async function buscarServicioParaContacto(servicioId: string) {
  return prisma.servicio.findUnique({ where: { id: servicioId }, select: { prestadorId: true } });
}

export async function registrarContacto(datos: { clienteId: string; prestadorId: string; servicioId: string | null }) {
  await prisma.contacto.create({ data: { ...datos, canal: "WHATSAPP" } });
}

/**
 * Datos públicos de un prestador. NO decide si se puede mostrar: eso lo
 * revisa antes el servicio (que tenga servicios visibles). Campo por campo:
 * nombre, descripción y comunas. Nunca teléfono, correo ni RUT.
 */
export async function buscarPrestadorPublico(prestadorId: string) {
  return prisma.perfilPrestador.findUnique({
    where: { id: prestadorId },
    select: {
      id: true,
      descripcion: true,
      usuario: { select: { nombre: true } },
      comunasAtencion: { select: { comuna: { select: { id: true, nombre: true, region: { select: { nombre: true } } } } } },
    },
  });
}

/** Los servicios que se listan en el perfil público, con su primera imagen visible. */
export async function buscarServiciosParaPerfil(servicioIds: string[]) {
  return prisma.servicio.findMany({
    where: { id: { in: servicioIds } },
    select: {
      id: true,
      titulo: true,
      categoriaPersonalizada: true,
      precioDesde: true,
      precioHasta: true,
      unidadPrecio: true,
      categoria: { select: { slug: true, nombre: true } },
      imagenes: {
        where: { estado: "VISIBLE" },
        orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
        take: 1,
        select: { identificador: true },
      },
    },
  });
}
