import { prisma } from "../../db.js";
import type { UnidadPrecio } from "../../generated/prisma/client.js";
import { prestadorConCertificaciones } from "../certificaciones/certificaciones.publicas.js";
import { columnasResumen } from "../valoraciones/valoraciones.resumen.js";
import { condicionServicioVisible } from "./servicios.visibilidad.js";

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
  /** Tiene al menos una certificación pública (certificaciones.publicas.ts). */
  conCertificaciones: boolean;
  /** Valoraciones publicadas del prestador y la suma de sus estrellas (valoraciones.resumen.ts). */
  valoracionesCantidad: number;
  valoracionesSuma: number;
  /** La primera imagen visible, para la miniatura; null si no tiene. */
  imagenIdentificador: string | null;
  /** Entró por la búsqueda de palabras (texto completo). */
  porTexto: boolean;
  /** Entró por significado (similitud de coseno sobre el umbral). */
  porSignificado: boolean;
  total: number;
}

export interface ParametrosBusqueda {
  /** tsquery ya armada por el servicio («gasfiter:* & domicilio:*»), o null sin texto. */
  consulta: string | null;
  /** Vector de la consulta como texto «[0.1,…]», o null (sin texto, o el proveedor falló). */
  vector: string | null;
  /** Similitud de coseno mínima para entrar por significado (0 a 1). */
  umbral: number;
  /** Constante k de Reciprocal Rank Fusion. */
  kRrf: number;
  /** Cuántos candidatos por significado entran a la fusión, como máximo. */
  candidatosSemanticos: number;
  categoria: string | null;
  comuna: number | null;
  precioMax: number | null;
  orden: "relevancia" | "recientes" | "precio";
  limite: number;
  desplazamiento: number;
  comunasPorResultado: number;
}

/**
 * Búsqueda pública HÍBRIDA: palabras + significado, fusionados con RRF.
 *
 * Es una sola consulta fija: cada filtro es un parámetro que puede venir en
 * NULL, y «$x IS NULL OR ...» lo desactiva. Así no se arma SQL concatenando
 * texto según qué filtros llegaron: todo valor viaja como parámetro ($1,
 * $2…), incluidos la consulta del usuario y su vector, y el texto del SQL
 * nunca cambia.
 *
 * Pasos, en orden:
 * 1. filtrados: los FILTROS DUROS, siempre y antes de ordenar nada:
 *    visibilidad (publicado y prestador con identidad verificada), categoría,
 *    comuna y precio. Ninguna similitud puede traer un servicio de fuera.
 * 2. lexico: dentro de ese conjunto, la búsqueda por palabras de siempre
 *    (texto completo, prefijos, sin tildes), ordenada por ts_rank_cd.
 * 3. semantico: dentro del MISMO conjunto, los más cercanos por distancia
 *    de coseno, solo si superan el umbral de similitud.
 * 4. fusion: Reciprocal Rank Fusion. Cada servicio suma 1 / (k + posición)
 *    por cada lista donde aparece. Solo importan las posiciones, no los
 *    puntajes, que en las dos listas están en escalas incomparables.
 */
export async function buscarServiciosPublicados(p: ParametrosBusqueda): Promise<FilaBusqueda[]> {
  return prisma.$queryRaw<FilaBusqueda[]>`
    WITH
    -- La tsquery se calcula una vez. to_tsquery pasa cada término por la
    -- misma configuración que la columna (unaccent + raíz en español), así
    -- que «Gasfitería», «gasfiteria» y «GASFITER» terminan comparándose
    -- igual. numnode = 0 es una consulta que quedó sin términos (solo
    -- palabras vacías como «de»): cuenta como búsqueda sin texto.
    busqueda AS (
      SELECT t.q, (t.q IS NOT NULL AND numnode(t.q) > 0) AS con_texto
        FROM (SELECT to_tsquery('espanol_sin_tildes', ${p.consulta}::text) AS q) t
    ),

    -- El vector de la consulta llega como UN parámetro de texto y la base lo
    -- convierte. Nunca se concatena dentro del SQL.
    consulta_vector AS (
      SELECT ${p.vector}::vector AS v
    ),

    -- 1. Filtros duros.
    filtrados AS (
      SELECT s.id, s.creado_en, s.busqueda AS documento, s.embedding,
             c.nombre AS categoria_nombre, s.categoria_personalizada
        FROM servicios s
        JOIN categorias c          ON c.id = s.categoria_id
        JOIN perfiles_prestador p  ON p.id = s.prestador_id
       -- La regla de visibilidad pública, la misma que la página del
       -- servicio y el contacto (servicios.visibilidad.ts). No se reescribe acá.
       WHERE ${condicionServicioVisible}
         AND (${p.categoria}::text IS NULL OR c.slug = ${p.categoria}::text)
         -- Comuna: prestadores que declararon atenderla (prestadores_comunas).
         AND (${p.comuna}::int IS NULL OR EXISTS (
                SELECT 1 FROM prestadores_comunas pc
                 WHERE pc.prestador_id = p.id AND pc.comuna_id = ${p.comuna}::int))
         -- Con tope de precio, «a convenir» (precio nulo) queda fuera: no se
         -- puede asegurar que entre en el presupuesto.
         AND (${p.precioMax}::int IS NULL OR s.precio_desde <= ${p.precioMax}::int)
    ),

    -- 2. Ranking por palabras: título y descripción por la columna generada
    -- (índice GIN); además la categoría y el oficio escrito con «Otros», que
    -- no están en esa columna. Desempate fijo: más reciente, luego id.
    lexico AS (
      SELECT f.id,
             row_number() OVER (ORDER BY ts_rank_cd(f.documento, b.q) DESC, f.creado_en DESC, f.id DESC) AS rango
        FROM filtrados f CROSS JOIN busqueda b
       WHERE b.con_texto
         AND (f.documento @@ b.q
              OR to_tsvector('espanol_sin_tildes', f.categoria_nombre || ' ' || coalesce(f.categoria_personalizada, '')) @@ b.q)
    ),

    -- 3. Ranking por significado: distancia de coseno (<=>) entre el vector
    -- del servicio y el de la consulta. Similitud = 1 - distancia. Por
    -- debajo del umbral no entra: sin él, cualquier consulta traería «lo
    -- menos lejano» aunque no tenga nada que ver. Un servicio sin vector
    -- (embedding nulo) no participa acá, pero sí en el ranking por palabras.
    semantico AS (
      SELECT x.id, x.rango
        FROM (
          SELECT f.id,
                 row_number() OVER (ORDER BY f.embedding <=> cv.v, f.id) AS rango
            FROM filtrados f CROSS JOIN consulta_vector cv CROSS JOIN busqueda b
           WHERE b.con_texto
             AND cv.v IS NOT NULL
             AND f.embedding IS NOT NULL
             AND 1 - (f.embedding <=> cv.v) >= ${p.umbral}::float8
        ) x
       WHERE x.rango <= ${p.candidatosSemanticos}::int
    ),

    -- 4. Reciprocal Rank Fusion con k fijo. numeric, no float: la suma es
    -- exacta y el orden no depende del redondeo (paginación estable).
    fusion AS (
      SELECT r.id,
             sum(1::numeric / (${p.kRrf}::int + r.rango)) AS puntaje,
             bool_or(r.fuente = 'texto')       AS por_texto,
             bool_or(r.fuente = 'significado') AS por_significado
        FROM (SELECT id, rango, 'texto' AS fuente FROM lexico
              UNION ALL
              SELECT id, rango, 'significado' AS fuente FROM semantico) r
       GROUP BY r.id
    ),

    -- Con texto, los que entraron por alguna de las dos vías; sin texto,
    -- todo lo que pasó los filtros.
    candidatos AS (
      SELECT id, puntaje, por_texto, por_significado FROM fusion
      UNION ALL
      SELECT f.id, NULL::numeric, FALSE, FALSE
        FROM filtrados f CROSS JOIN busqueda b
       WHERE NOT b.con_texto
    )

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

      -- Sello «Prestador con certificaciones»: la misma regla que su perfil
      -- público y la página del servicio (certificaciones.publicas.ts).
      ${prestadorConCertificaciones} AS "conCertificaciones",

      -- Conteo y suma de las valoraciones publicadas. El promedio (y la
      -- regla de mostrarlo solo con 3 o más) lo calcula resumenCorto().
      ${columnasResumen},

      -- La miniatura: la primera imagen VISIBLE de la galería, si hay.
      (SELECT im.identificador
         FROM imagenes_servicio im
        WHERE im.servicio_id = s.id AND im.estado = 'VISIBLE'
        ORDER BY im.orden, im.creado_en
        LIMIT 1)                 AS "imagenIdentificador",

      k.por_texto                AS "porTexto",
      k.por_significado          AS "porSignificado",

      -- Total de coincidencias antes de LIMIT/OFFSET, para la paginación.
      count(*) OVER ()::int      AS total
    FROM candidatos k
    JOIN servicios s           ON s.id = k.id
    JOIN categorias c          ON c.id = s.categoria_id
    JOIN perfiles_prestador p  ON p.id = s.prestador_id
    JOIN usuarios u            ON u.id = p.usuario_id

    -- El id al final desempata: con un orden total, cada fila tiene un lugar
    -- fijo, la misma consulta da siempre el mismo orden y la paginación no
    -- repite ni salta resultados.
    ORDER BY
      CASE WHEN ${p.orden}::text = 'precio' THEN s.precio_desde END ASC NULLS LAST,
      CASE WHEN ${p.orden}::text = 'relevancia' THEN k.puntaje END DESC NULLS LAST,
      s.creado_en DESC,
      s.id DESC
    LIMIT ${p.limite}::int OFFSET ${p.desplazamiento}::int
  `;
}

/**
 * Categorías para sugerir cuando una búsqueda no trae nada.
 *
 * Con el vector de la consulta: las categorías cuyos servicios están más
 * cerca de lo que se buscó (la menor distancia de cada una). Sin vector, o
 * para completar: las que tienen más servicios. Solo cuenta lo visible al
 * público y, si se filtró por comuna, lo que se atiende ahí: una sugerencia
 * siempre lleva a resultados. «Otros» no se sugiere: no dice nada.
 */
export async function categoriasCercanas(p: { vector: string | null; comuna: number | null; limite: number }) {
  return prisma.$queryRaw<{ slug: string; nombre: string }[]>`
    SELECT c.slug, c.nombre
      FROM servicios s
      JOIN categorias c          ON c.id = s.categoria_id
      JOIN perfiles_prestador p  ON p.id = s.prestador_id
      CROSS JOIN (SELECT ${p.vector}::vector AS v) cv
     WHERE ${condicionServicioVisible}
       AND c.slug <> 'otros'
       AND (${p.comuna}::int IS NULL OR EXISTS (
              SELECT 1 FROM prestadores_comunas pc
               WHERE pc.prestador_id = p.id AND pc.comuna_id = ${p.comuna}::int))
     GROUP BY c.slug, c.nombre, c.orden
     ORDER BY min(s.embedding <=> cv.v) ASC NULLS LAST, count(*) DESC, c.orden
     LIMIT ${p.limite}::int
  `;
}
