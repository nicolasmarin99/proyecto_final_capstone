import { prisma } from "../../db.js";
import type { EstadoServicio, UnidadPrecio } from "../../generated/prisma/client.js";

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
      categoriaPersonalizada: true,
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

/** Una fila del resultado de la búsqueda, tal como la devuelve la consulta. */
export interface FilaBusqueda {
  id: string;
  titulo: string;
  categoriaSlug: string;
  categoriaNombre: string;
  categoriaPersonalizada: string | null;
  precioDesde: number | null;
  precioHasta: number | null;
  unidadPrecio: UnidadPrecio | null;
  prestadorNombre: string;
  comunas: { id: number; nombre: string }[] | null;
  totalComunas: number;
  acreditado: boolean;
  total: number;
}

export interface ParametrosBusqueda {
  /** tsquery ya armada por el servicio («gasfiter:* & domicilio:*»), o null sin texto. */
  consulta: string | null;
  categoria: string | null;
  comuna: number | null;
  precioMax: number | null;
  orden: "recientes" | "precio";
  limite: number;
  desplazamiento: number;
  comunasPorResultado: number;
}

/**
 * Búsqueda pública de servicios.
 *
 * Es una sola consulta fija: cada filtro es un parámetro que puede venir en
 * NULL, y «$x IS NULL OR ...» lo desactiva. Así no se arma SQL concatenando
 * texto según qué filtros llegaron: todo valor viaja como parámetro ($1, $2…)
 * y el texto de la consulta nunca cambia.
 */
export async function buscarServiciosPublicados(p: ParametrosBusqueda): Promise<FilaBusqueda[]> {
  return prisma.$queryRaw<FilaBusqueda[]>`
    SELECT
      s.id,
      s.titulo,
      c.slug                     AS "categoriaSlug",
      c.nombre                   AS "categoriaNombre",
      s.categoria_personalizada  AS "categoriaPersonalizada",
      s.precio_desde             AS "precioDesde",
      s.precio_hasta             AS "precioHasta",
      s.unidad_precio::text      AS "unidadPrecio",
      u.nombre                   AS "prestadorNombre",

      -- Hasta N comunas del prestador; la que se buscó va primero, para que
      -- la tarjeta muestre por qué apareció. El resto, ordenadas por nombre.
      (SELECT json_agg(json_build_object('id', x.id, 'nombre', x.nombre))
         FROM (SELECT co.id, co.nombre
                 FROM prestadores_comunas pc
                 JOIN comunas co ON co.id = pc.comuna_id
                WHERE pc.prestador_id = p.id
                ORDER BY (co.id = ${p.comuna}::int) IS TRUE DESC, co.nombre
                LIMIT ${p.comunasPorResultado}::int) x
      )                          AS comunas,
      (SELECT count(*)::int FROM prestadores_comunas pc WHERE pc.prestador_id = p.id) AS "totalComunas",

      -- Al menos una credencial vigente contrastada con el registro oficial
      -- (método AUTOMATICO). La revisada a mano no cuenta para este sello.
      EXISTS (SELECT 1
                FROM credenciales cr
               WHERE cr.prestador_id = p.id
                 AND cr.estado = 'VERIFICADA'
                 AND cr.metodo = 'AUTOMATICO') AS acreditado,

      -- Total de coincidencias antes de LIMIT/OFFSET, para la paginación.
      count(*) OVER ()::int      AS total
    FROM servicios s
    JOIN categorias c          ON c.id = s.categoria_id
    JOIN perfiles_prestador p  ON p.id = s.prestador_id
    JOIN usuarios u            ON u.id = p.usuario_id

    -- La tsquery se calcula una vez. to_tsquery pasa cada término por la
    -- misma configuración que la columna (unaccent + raíz en español), así
    -- que «Gasfitería», «gasfiteria» y «GASFITER» terminan comparándose
    -- igual. El «:*» de cada término la vuelve búsqueda por prefijo.
    CROSS JOIN (SELECT to_tsquery('espanol_sin_tildes', ${p.consulta}::text) AS q) busqueda

    WHERE s.estado = 'PUBLICADO'
      -- Solo prestadores con identidad verificada y cuenta en uso.
      AND u.rut_verificado
      AND u.activo
      AND u.anonimizado_en IS NULL

      -- Texto: título y descripción por la columna generada (índice GIN);
      -- además la categoría y el oficio escrito con «Otros», que no están en
      -- esa columna. numnode = 0 es una consulta que quedó sin términos (solo
      -- palabras vacías como «de»): se ignora en vez de no devolver nada.
      AND (busqueda.q IS NULL
           OR numnode(busqueda.q) = 0
           OR s.busqueda @@ busqueda.q
           OR to_tsvector('espanol_sin_tildes', c.nombre || ' ' || coalesce(s.categoria_personalizada, '')) @@ busqueda.q)

      AND (${p.categoria}::text IS NULL OR c.slug = ${p.categoria}::text)

      -- Comuna: prestadores que declararon atenderla (prestadores_comunas).
      AND (${p.comuna}::int IS NULL OR EXISTS (
             SELECT 1 FROM prestadores_comunas pc
              WHERE pc.prestador_id = p.id AND pc.comuna_id = ${p.comuna}::int))

      -- Con tope de precio, «a convenir» (precio nulo) queda fuera: no se
      -- puede asegurar que entre en el presupuesto.
      AND (${p.precioMax}::int IS NULL OR s.precio_desde <= ${p.precioMax}::int)

    -- El id al final desempata: con un orden total, cada fila tiene un lugar
    -- fijo y la paginación no repite ni salta resultados.
    ORDER BY
      CASE WHEN ${p.orden}::text = 'precio' THEN s.precio_desde END ASC NULLS LAST,
      s.creado_en DESC,
      s.id DESC
    LIMIT ${p.limite}::int OFFSET ${p.desplazamiento}::int
  `;
}
