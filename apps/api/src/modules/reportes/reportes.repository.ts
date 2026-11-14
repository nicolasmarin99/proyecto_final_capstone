import { prisma } from "../../db.js";
import { Prisma, type AccionReporte, type MotivoDenuncia } from "../../generated/prisma/client.js";

/** Estados de una denuncia que todavía espera una decisión. */
const ABIERTAS = ["ABIERTA", "EN_REVISION"] as const;

/** Lo necesario para decidir si alguien puede reportar este servicio. */
export async function buscarServicioReportable(id: string) {
  return prisma.servicio.findUnique({
    where: { id },
    select: { id: true, estado: true, categoriaId: true, prestador: { select: { usuarioId: true } } },
  });
}

/** Categorías en que la persona ofrece servicios, si es prestador. Vacío si no tiene perfil o servicios. */
export async function categoriasDelUsuario(usuarioId: string) {
  const filas = await prisma.servicio.findMany({
    where: { prestador: { usuarioId } },
    select: { categoriaId: true },
    distinct: ["categoriaId"],
  });
  return new Set(filas.map((fila) => fila.categoriaId));
}

export type ResultadoReporte = "creado" | "ya_existia" | "limite";

/**
 * Crea el reporte respetando, bajo bloqueo, las dos reglas que dependen de
 * lo que ya hizo la persona:
 * - a lo más `maximoDiario` reportes en 24 horas (los retirados cuentan:
 *   retirar y volver a reportar no esquiva el límite);
 * - uno abierto por persona y servicio (además lo garantiza el índice único
 *   parcial denuncias_una_abierta_por_persona_y_servicio).
 *
 * El FOR UPDATE sobre la fila del usuario serializa los reportes de una
 * misma persona: dos envíos simultáneos no pueden contar 4 los dos y
 * dejar 6.
 */
export async function crearReporte(
  datos: { denuncianteId: string; servicioId: string; motivo: MotivoDenuncia; comentario: string | null },
  maximoDiario: number,
): Promise<ResultadoReporte> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${datos.denuncianteId} FOR UPDATE`;

      const recientes = await tx.denuncia.count({
        where: { denuncianteId: datos.denuncianteId, creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (recientes >= maximoDiario) return "limite";

      const abierta = await tx.denuncia.findFirst({
        where: { denuncianteId: datos.denuncianteId, servicioId: datos.servicioId, estado: { in: [...ABIERTAS] } },
        select: { id: true },
      });
      if (abierta) return "ya_existia";

      await tx.denuncia.create({
        data: {
          denuncianteId: datos.denuncianteId,
          servicioId: datos.servicioId,
          motivo: datos.motivo,
          detalle: datos.comentario,
        },
      });
      return "creado";
    });
  } catch (error) {
    // Defensa en profundidad: si igual chocó con el índice único, ya existía.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "ya_existia";
    throw error;
  }
}

/** Marca como RETIRADA la denuncia abierta de esa persona sobre ese servicio. La fila no se borra. */
export async function retirarReporte(denuncianteId: string, servicioId: string) {
  const { count } = await prisma.denuncia.updateMany({
    where: { denuncianteId, servicioId, estado: { in: [...ABIERTAS] } },
    data: { estado: "RETIRADA" },
  });
  return count;
}

export async function reporteAbiertoDe(denuncianteId: string, servicioId: string) {
  return prisma.denuncia.findFirst({
    where: { denuncianteId, servicioId, estado: { in: [...ABIERTAS] } },
    select: { motivo: true, creadoEn: true },
  });
}

export interface FilaCola {
  /** Qué se reportó: un servicio (reportes de usuarios) o una valoración (objeción de su prestador). */
  tipo: "SERVICIO" | "VALORACION";
  /** Id del servicio o de la valoración. */
  id: string;
  /** Título del servicio; null en una valoración. */
  titulo: string | null;
  /** Estado del servicio o de la valoración. */
  estadoObjeto: string;
  prestador: string;
  personas: number;
  reportes: number;
  motivoFrecuente: MotivoDenuncia;
  primerReporte: Date;
  resueltoEn: Date | null;
  /** Solo valoraciones: lo valorado y el comentario de la objeción. */
  calificacion: number | null;
  comentario: string | null;
  detalleObjecion: string | null;
  editadaEn: Date | null;
  total: number;
}

/**
 * Cola de reportes: servicios AGRUPADOS POR SERVICIO y valoraciones
 * objetadas, en una sola lista.
 *
 * - personas: personas DISTINTAS que lo reportaron (no reportes): diez
 *   reportes de la misma persona, a lo largo del tiempo, siguen siendo una.
 *   Una valoración tiene a lo más una objeción (la de su prestador).
 * - motivoFrecuente: el motivo que más se repite (mode()).
 * - Orden: primero los de prioridad alta (umbral o más personas), después
 *   los que llevan más tiempo esperando; el tipo y el id desempatan.
 *
 * Nunca selecciona quién reportó: ni el id ni el nombre salen de aquí.
 * Consulta fija con todos los valores como parámetros ($queryRaw).
 */
export async function colaAgrupada(filtro: {
  estado: "pendientes" | "resueltos";
  umbralPrioridad: number;
  limite: number;
  desplazamiento: number;
}): Promise<FilaCola[]> {
  const enEstado = Prisma.sql`(
    (${filtro.estado}::text = 'pendientes' AND d.estado IN ('ABIERTA', 'EN_REVISION'))
    OR
    (${filtro.estado}::text = 'resueltos' AND d.estado IN ('RESUELTA', 'DESESTIMADA'))
  )`;

  return prisma.$queryRaw<FilaCola[]>`
    WITH casos AS (
      SELECT
        'SERVICIO'                                           AS tipo,
        s.id                                                 AS id,
        s.titulo                                             AS titulo,
        s.estado::text                                       AS "estadoObjeto",
        u.nombre                                             AS prestador,
        count(DISTINCT d.denunciante_id)::int                AS personas,
        count(*)::int                                        AS reportes,
        mode() WITHIN GROUP (ORDER BY d.motivo)::text        AS "motivoFrecuente",
        min(d.creado_en)                                     AS "primerReporte",
        max(d.resuelta_en)                                   AS "resueltoEn",
        NULL::int                                            AS calificacion,
        NULL::text                                           AS comentario,
        NULL::text                                           AS "detalleObjecion",
        NULL::timestamp(3)                                   AS "editadaEn"
      FROM denuncias d
      JOIN servicios s           ON s.id = d.servicio_id
      JOIN perfiles_prestador p  ON p.id = s.prestador_id
      JOIN usuarios u            ON u.id = p.usuario_id
      WHERE d.servicio_id IS NOT NULL AND ${enEstado}
      GROUP BY s.id, s.titulo, s.estado, u.nombre

      UNION ALL

      SELECT
        'VALORACION',
        v.id,
        -- El servicio que se valoró (cada valoración califica uno).
        sv.titulo,
        v.estado::text,
        u.nombre,
        1,
        1,
        d.motivo::text,
        d.creado_en,
        d.resuelta_en,
        v.calificacion,
        v.comentario,
        d.detalle,
        v.editada_en
      FROM denuncias d
      JOIN valoraciones v        ON v.id = d.valoracion_id
      JOIN servicios sv          ON sv.id = v.servicio_id
      JOIN perfiles_prestador p  ON p.id = v.prestador_id
      JOIN usuarios u            ON u.id = p.usuario_id
      WHERE d.valoracion_id IS NOT NULL AND ${enEstado}
    )
    SELECT casos.*, count(*) OVER ()::int AS total
    FROM casos
    ORDER BY
      (personas >= ${filtro.umbralPrioridad}::int) DESC,
      "primerReporte" ASC,
      tipo,
      id
    LIMIT ${filtro.limite}::int OFFSET ${filtro.desplazamiento}::int
  `;
}

/**
 * Detalle de los reportes de un servicio. De quien reportó solo se lee la
 * fecha de creación de su cuenta, para saber si tenía más de una semana: el
 * servicio la convierte en un booleano y la descarta.
 */
export async function detalleReportes(servicioId: string) {
  const [servicio, denuncias, decisiones, porPersona] = await Promise.all([
    prisma.servicio.findUnique({
      where: { id: servicioId },
      select: {
        id: true,
        titulo: true,
        estado: true,
        categoria: { select: { nombre: true } },
        categoriaPersonalizada: true,
        prestador: { select: { usuario: { select: { nombre: true } } } },
      },
    }),
    prisma.denuncia.findMany({
      where: { servicioId, estado: { not: "RETIRADA" } },
      orderBy: { creadoEn: "asc" },
      select: { id: true, motivo: true, detalle: true, estado: true, creadoEn: true, denunciante: { select: { creadoEn: true } } },
    }),
    prisma.decisionReporte.findMany({
      where: { servicioId },
      orderBy: { creadoEn: "desc" },
      select: { accion: true, motivo: true, reportesCerrados: true, creadoEn: true, administrador: { select: { nombre: true } } },
    }),
    // Solo para contar personas distintas: los ids agrupados no salen de esta función.
    prisma.denuncia.groupBy({ by: ["denuncianteId"], where: { servicioId, estado: { not: "RETIRADA" } } }),
  ]);
  return { servicio, denuncias, decisiones, personas: porPersona.length };
}

type UltimaDecision = { accion: AccionReporte; motivo: string; creadoEn: Date };

/** La última decisión de cada servicio y de cada valoración pedidos (para la cola de resueltos). */
export async function ultimasDecisiones(servicioIds: string[], valoracionIds: string[]) {
  const porObjeto = new Map<string, UltimaDecision>();
  if (servicioIds.length === 0 && valoracionIds.length === 0) return porObjeto;
  const filas = await prisma.decisionReporte.findMany({
    where: { OR: [{ servicioId: { in: servicioIds } }, { valoracionId: { in: valoracionIds } }] },
    orderBy: { creadoEn: "desc" },
    select: { servicioId: true, valoracionId: true, accion: true, motivo: true, creadoEn: true },
  });
  for (const fila of filas) {
    const clave = fila.servicioId ?? fila.valoracionId;
    if (clave && !porObjeto.has(clave)) porObjeto.set(clave, fila);
  }
  return porObjeto;
}

/** Motivo con que se ocultó cada servicio (la última decisión OCULTAR_SERVICIO), para su dueño. */
export async function motivosDeOcultamiento(servicioIds: string[]) {
  if (servicioIds.length === 0) return new Map<string, { motivo: string; creadoEn: Date }>();
  const filas = await prisma.decisionReporte.findMany({
    where: { servicioId: { in: servicioIds }, accion: "OCULTAR_SERVICIO" },
    orderBy: { creadoEn: "desc" },
    select: { servicioId: true, motivo: true, creadoEn: true },
  });
  const porServicio = new Map<string, { motivo: string; creadoEn: Date }>();
  for (const fila of filas) if (fila.servicioId && !porServicio.has(fila.servicioId)) porServicio.set(fila.servicioId, fila);
  return porServicio;
}

export type ResultadoDecision = "hecho" | "sin_servicio" | "sin_pendientes" | "ya_oculto";

/**
 * Registra una decisión sobre los reportes de un servicio, todo o nada:
 * 1. bloquea el servicio (dos administradores no deciden a la vez);
 * 2. cierra sus reportes abiertos, con el motivo y quién decidió;
 * 3. si la acción es ocultar, pasa el servicio a OCULTO;
 * 4. inserta la decisión en la bitácora (solo inserción).
 *
 * Desestimar exige reportes abiertos: no hay nada que desestimar si no.
 * Ocultar no los exige (un administrador puede ocultar tras revisar un
 * caso ya cerrado), pero no se oculta dos veces.
 */
export async function registrarDecision(datos: {
  servicioId: string;
  administradorId: string;
  accion: AccionReporte;
  motivo: string;
}): Promise<ResultadoDecision> {
  return prisma.$transaction(async (tx) => {
    const [servicio] = await tx.$queryRaw<{ estado: string }[]>`
      SELECT estado::text AS estado FROM servicios WHERE id = ${datos.servicioId} FOR UPDATE`;
    if (!servicio) return "sin_servicio";
    if (datos.accion === "OCULTAR_SERVICIO" && servicio.estado === "OCULTO") return "ya_oculto";

    const { count } = await tx.denuncia.updateMany({
      where: { servicioId: datos.servicioId, estado: { in: [...ABIERTAS] } },
      data: {
        estado: datos.accion === "DESESTIMAR" ? "DESESTIMADA" : "RESUELTA",
        resolucion: datos.motivo,
        resueltaPorId: datos.administradorId,
        resueltaEn: new Date(),
      },
    });
    if (datos.accion === "DESESTIMAR" && count === 0) return "sin_pendientes";

    if (datos.accion === "OCULTAR_SERVICIO") {
      await tx.servicio.update({ where: { id: datos.servicioId }, data: { estado: "OCULTO" } });
    }

    await tx.decisionReporte.create({
      data: {
        servicioId: datos.servicioId,
        accion: datos.accion,
        motivo: datos.motivo,
        reportesCerrados: count,
        administradorId: datos.administradorId,
      },
    });
    return "hecho";
  });
}

export type ResultadoDecisionValoracion = "hecho" | "sin_valoracion" | "sin_pendientes" | "ya_oculta";

/**
 * Decisión sobre una valoración objetada, todo o nada, como la de un
 * servicio:
 * 1. bloquea la valoración (dos administradores no deciden a la vez);
 * 2. cierra su objeción abierta, con el motivo y quién decidió;
 * 3. si la acción es ocultar, pasa la valoración a OCULTA (sale del
 *    promedio, del conteo y de la lista pública);
 * 4. inserta la decisión en la bitácora (solo inserción).
 *
 * Es el ÚNICO camino por el que una valoración deja de estar publicada, y
 * solo lo llama un administrador.
 */
export async function registrarDecisionValoracion(datos: {
  valoracionId: string;
  administradorId: string;
  accion: "DESESTIMAR" | "OCULTAR_VALORACION";
  motivo: string;
}): Promise<ResultadoDecisionValoracion> {
  return prisma.$transaction(async (tx) => {
    const [valoracion] = await tx.$queryRaw<{ estado: string }[]>`
      SELECT estado::text AS estado FROM valoraciones WHERE id = ${datos.valoracionId} FOR UPDATE`;
    if (!valoracion) return "sin_valoracion";
    if (datos.accion === "OCULTAR_VALORACION" && valoracion.estado === "OCULTA") return "ya_oculta";

    const { count } = await tx.denuncia.updateMany({
      where: { valoracionId: datos.valoracionId, estado: { in: [...ABIERTAS] } },
      data: {
        estado: datos.accion === "DESESTIMAR" ? "DESESTIMADA" : "RESUELTA",
        resolucion: datos.motivo,
        resueltaPorId: datos.administradorId,
        resueltaEn: new Date(),
      },
    });
    if (datos.accion === "DESESTIMAR" && count === 0) return "sin_pendientes";

    if (datos.accion === "OCULTAR_VALORACION") {
      await tx.valoracion.update({ where: { id: datos.valoracionId }, data: { estado: "OCULTA" } });
    }

    await tx.decisionReporte.create({
      data: {
        valoracionId: datos.valoracionId,
        accion: datos.accion,
        motivo: datos.motivo,
        reportesCerrados: count,
        administradorId: datos.administradorId,
      },
    });
    return "hecho";
  });
}
