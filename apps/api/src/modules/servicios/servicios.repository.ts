import { prisma } from "../../db.js";
import type { EstadoServicio, UnidadPrecio } from "../../generated/prisma/client.js";
import { seleccionImagen } from "../imagenes/imagenes.repository.js";

/** Lo que ve el dueño de su servicio. */
const seleccionServicio = {
  id: true,
  categoriaPersonalizada: true,
  titulo: true,
  descripcion: true,
  precioDesde: true,
  precioHasta: true,
  unidadPrecio: true,
  estado: true,
  categoria: { select: { slug: true, nombre: true } },
  // El dueño ve todas sus imágenes, también las ocultas por moderación.
  // Un solo criterio: con `as const` una lista quedaría de solo lectura y
  // Prisma no la acepta. El orden no tiene huecos ni repetidos (lo compacta
  // imagenes.repository al borrar).
  imagenes: { orderBy: { orden: "asc" }, select: seleccionImagen },
  creadoEn: true,
  actualizadoEn: true,
} as const;

interface CamposServicio {
  categoriaId: string;
  categoriaPersonalizada: string | null;
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
 * Datos públicos de un servicio. NO decide si es visible: eso lo revisa
 * antes el servicio con esServicioVisible (servicios.visibilidad.ts), la
 * misma regla que el buscador.
 *
 * La selección enumera campo por campo lo que puede salir. Del prestador:
 * solo su nombre y sus comunas. Nunca su teléfono, su correo ni su RUT.
 * Sus certificaciones salen aparte, con la regla de certificaciones.publicas.ts.
 */
export async function buscarServicioPublico(id: string) {
  return prisma.servicio.findUnique({
    where: { id },
    select: {
      id: true,
      categoriaPersonalizada: true,
      titulo: true,
      descripcion: true,
      precioDesde: true,
      precioHasta: true,
      unidadPrecio: true,
      categoria: { select: { slug: true, nombre: true } },
      actualizadoEn: true,
      // Solo las visibles: una oculta por moderación no se publica.
      imagenes: {
        where: { estado: "VISIBLE" },
        orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
        select: { id: true, identificador: true },
      },
      prestador: {
        select: {
          id: true,
          usuario: { select: { nombre: true } },
          comunasAtencion: {
            select: { comuna: { select: { id: true, nombre: true, region: { select: { nombre: true } } } } },
          },
        },
      },
    },
  });
}

// ─── Embeddings (búsqueda semántica) ──────────────────────────────────────

/** Lo que hace falta para armar el texto que se vectoriza y saber si está al día. */
const seleccionIndexacion = {
  id: true,
  titulo: true,
  descripcion: true,
  categoriaPersonalizada: true,
  categoria: { select: { nombre: true } },
  embeddingTextoHash: true,
} as const;

export type FilaIndexacion = Awaited<ReturnType<typeof serviciosParaIndexar>>[number];

export async function serviciosParaIndexar(ids: string[]) {
  return prisma.servicio.findMany({ where: { id: { in: ids } }, select: seleccionIndexacion });
}

/** Una página del catálogo completo, por id: el script de regeneración lo recorre así. */
export async function paginaParaIndexar(despuesDe: string | null, tamano: number) {
  return prisma.servicio.findMany({
    ...(despuesDe ? { where: { id: { gt: despuesDe } } } : {}),
    orderBy: { id: "asc" },
    take: tamano,
    select: seleccionIndexacion,
  });
}

/**
 * Guarda el vector de un servicio, o lo borra (vector null). Prisma no
 * conoce el tipo vector, así que va por $executeRaw: el vector viaja como
 * UN parámetro de texto («[0.12,-0.03,…]») y la base lo convierte con
 * ::vector. Nunca se arma SQL con los números.
 */
export async function guardarEmbedding(id: string, embedding: { vector: number[]; hash: string } | null) {
  if (!embedding) {
    await prisma.$executeRaw`
      UPDATE servicios
         SET embedding = NULL, embedding_texto_hash = NULL, embedding_actualizado_en = NULL
       WHERE id = ${id}`;
    return;
  }
  await prisma.$executeRaw`
    UPDATE servicios
       SET embedding = ${`[${embedding.vector.join(",")}]`}::vector,
           embedding_texto_hash = ${embedding.hash},
           embedding_actualizado_en = now()
     WHERE id = ${id}`;
}
