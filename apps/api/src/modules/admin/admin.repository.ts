import { prisma } from "../../db.js";
import type { Rol } from "../../generated/prisma/client.js";

/**
 * Agrupa en la base en vez de traer las filas y contarlas en Node: con muchos
 * usuarios, lo segundo movería toda la tabla por la red para descartarla.
 */
export async function contarUsuariosPorRol(): Promise<{ rol: Rol; total: number }[]> {
  const grupos = await prisma.usuario.groupBy({
    by: ["rol"],
    _count: { _all: true },
  });

  return grupos.map((grupo) => ({ rol: grupo.rol, total: grupo._count._all }));
}

/** Un prestador con algo por revisar, y cuánto de cada tipo. */
export interface FilaPendientes {
  id: string;
  nombre: string;
  identidad: number;
  certificaciones: number;
  cursos: number;
  reportes: number;
  imagenes: number;
  /** Desde cuándo espera lo más antiguo. */
  desde: Date;
  total: number;
}

/**
 * Prestadores con algo pendiente de revisión, y cuánto de cada tipo.
 *
 * Reúne, por prestador, las mismas cosas que muestran las colas (con las
 * mismas condiciones, para que los números coincidan al desplegarlo):
 * - identidad, certificaciones y cursos: credenciales en estado PENDIENTE;
 * - reportes: servicios suyos con reportes abiertos (uno por servicio, por
 *   muchas personas que lo hayan reportado) y valoraciones que objetó;
 * - imágenes: fotos visibles que ningún administrador ha revisado.
 *
 * Orden: primero quien lleva más tiempo esperando; el id desempata, así la
 * paginación es estable. Consulta fija: los únicos valores son la página,
 * y van como parámetros.
 *
 * De cada prestador sale su nombre y nada más: los datos para decidir
 * (RUT, documentos) los entrega cada cola al desplegarla.
 */
export async function prestadoresConPendientes(limite: number, desplazamiento: number): Promise<FilaPendientes[]> {
  return prisma.$queryRaw<FilaPendientes[]>`
    WITH pendientes AS (
      SELECT c.prestador_id,
             CASE t.codigo WHEN 'IDENTIDAD' THEN 'identidad' WHEN 'CURSO' THEN 'curso' ELSE 'certificacion' END AS tipo,
             c.creado_en AS desde
        FROM credenciales c
        JOIN tipos_credencial t ON t.id = c.tipo_id
       WHERE c.estado = 'PENDIENTE'

      UNION ALL

      SELECT s.prestador_id, 'reporte', min(d.creado_en)
        FROM denuncias d
        JOIN servicios s ON s.id = d.servicio_id
       WHERE d.servicio_id IS NOT NULL AND d.estado IN ('ABIERTA', 'EN_REVISION')
       GROUP BY s.prestador_id, s.id

      UNION ALL

      SELECT v.prestador_id, 'reporte', d.creado_en
        FROM denuncias d
        JOIN valoraciones v ON v.id = d.valoracion_id
       WHERE d.valoracion_id IS NOT NULL AND d.estado IN ('ABIERTA', 'EN_REVISION')

      UNION ALL

      SELECT s.prestador_id, 'imagen', i.creado_en
        FROM imagenes_servicio i
        JOIN servicios s ON s.id = i.servicio_id
       WHERE i.estado = 'VISIBLE' AND i.revisada_en IS NULL
    )
    SELECT p.id,
           u.nombre,
           count(*) FILTER (WHERE x.tipo = 'identidad')::int     AS identidad,
           count(*) FILTER (WHERE x.tipo = 'certificacion')::int AS certificaciones,
           count(*) FILTER (WHERE x.tipo = 'curso')::int         AS cursos,
           count(*) FILTER (WHERE x.tipo = 'reporte')::int       AS reportes,
           count(*) FILTER (WHERE x.tipo = 'imagen')::int        AS imagenes,
           min(x.desde)                                          AS desde,
           count(*) OVER ()::int                                 AS total
      FROM pendientes x
      JOIN perfiles_prestador p ON p.id = x.prestador_id
      JOIN usuarios u           ON u.id = p.usuario_id
     GROUP BY p.id, u.nombre
     ORDER BY min(x.desde) ASC, p.id ASC
     LIMIT ${limite}::int OFFSET ${desplazamiento}::int
  `;
}
