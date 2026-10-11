import { prisma } from "../../db.js";
import type { EstadoServicio, UnidadPrecio } from "../../generated/prisma/client.js";

/** Lo que ve el dueño de su servicio. */
const seleccionServicio = {
  id: true,
  titulo: true,
  descripcion: true,
  precioDesde: true,
  precioHasta: true,
  unidadPrecio: true,
  estado: true,
  categoria: { select: { slug: true, nombre: true } },
  creadoEn: true,
  actualizadoEn: true,
} as const;

interface CamposServicio {
  categoriaId: string;
  titulo: string;
  descripcion: string;
  precioDesde: number | null;
  precioHasta: number | null;
  unidadPrecio: UnidadPrecio | null;
  estado: EstadoServicio;
}

/** Lo necesario para decidir si un prestador puede publicar. */
export async function buscarPerfilParaPublicar(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({
    where: { usuarioId },
    select: {
      id: true,
      usuario: { select: { rutVerificado: true } },
      _count: { select: { comunasAtencion: true } },
    },
  });
}

export async function buscarCategoriaActiva(slug: string) {
  return prisma.categoria.findFirst({ where: { slug, activa: true }, select: { id: true } });
}

export async function listarCategoriasActivas() {
  return prisma.categoria.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: { slug: true, nombre: true },
  });
}

export async function crearServicio(prestadorId: string, campos: CamposServicio) {
  return prisma.servicio.create({ data: { prestadorId, ...campos }, select: seleccionServicio });
}

/** Solo lo que hace falta para revisar quién es el dueño. */
export async function buscarDuenoServicio(id: string) {
  return prisma.servicio.findUnique({ where: { id }, select: { prestadorId: true, estado: true } });
}

export async function actualizarServicio(id: string, campos: CamposServicio) {
  return prisma.servicio.update({ where: { id }, data: campos, select: seleccionServicio });
}

/**
 * Contactos y denuncias apuntan al servicio con RESTRICT: son historia de la
 * plataforma (de un contacto cuelga después la valoración). Si hay alguno,
 * el servicio no se puede borrar.
 */
export async function contarReferencias(id: string) {
  const [contactos, denuncias] = await Promise.all([
    prisma.contacto.count({ where: { servicioId: id } }),
    prisma.denuncia.count({ where: { servicioId: id } }),
  ]);
  return contactos + denuncias;
}

export async function eliminarServicio(id: string) {
  await prisma.servicio.delete({ where: { id } });
}

export async function listarServiciosDe(prestadorId: string) {
  return prisma.servicio.findMany({
    where: { prestadorId },
    orderBy: { actualizadoEn: "desc" },
    select: seleccionServicio,
  });
}

/**
 * Vista pública de un servicio PUBLICADO.
 *
 * La selección enumera campo por campo lo que puede salir. Del prestador:
 * solo su nombre, sus comunas y sus credenciales verificadas. Nunca su
 * teléfono, su correo ni su RUT, y de las credenciales nunca el
 * identificador del documento (para la cédula, es el RUT).
 */
export async function buscarServicioPublico(id: string) {
  return prisma.servicio.findFirst({
    where: { id, estado: "PUBLICADO" },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      precioDesde: true,
      precioHasta: true,
      unidadPrecio: true,
      categoria: { select: { slug: true, nombre: true } },
      actualizadoEn: true,
      prestador: {
        select: {
          id: true,
          usuario: { select: { nombre: true } },
          comunasAtencion: {
            select: { comuna: { select: { id: true, nombre: true, region: { select: { nombre: true } } } } },
          },
          credenciales: {
            where: { estado: "VERIFICADA" },
            orderBy: { fechaConsulta: "desc" },
            select: {
              metodo: true,
              fechaConsulta: true,
              tipo: { select: { nombre: true, fuenteOficial: true } },
            },
          },
        },
      },
    },
  });
}
