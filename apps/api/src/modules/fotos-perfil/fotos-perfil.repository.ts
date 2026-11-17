import { prisma } from "../../db.js";
import { Prisma, type MotivoDenuncia } from "../../generated/prisma/client.js";

/** Estados de una denuncia que todavía espera una decisión. */
const ABIERTAS = ["ABIERTA", "EN_REVISION"] as const;

/**
 * Selección de la foto vigente de una cuenta, para anidarla donde se lee un
 * usuario (perfil público, página de un servicio, valoraciones). Solo el id
 * y el identificador: la URL la arma fotos-perfil.urls.ts.
 */
export const seleccionFotoVigente = {
  where: { estado: "VIGENTE" },
  select: { id: true, identificador: true },
  take: 1,
} as const satisfies Prisma.Usuario$fotosPerfilArgs;

/**
 * Cierra, dentro de una transacción, los reportes abiertos de una foto que
 * su dueño cambió o quitó: lo reportado ya no se muestra y no queda nada
 * que decidir. Quedan RETIRADOS (sin resolución), no desestimados: nadie
 * los revisó.
 */
async function cerrarReportesDeFotoQueSeQuita(tx: Prisma.TransactionClient, fotoId: string) {
  await tx.denuncia.updateMany({
    where: { fotoPerfilId: fotoId, estado: { in: [...ABIERTAS] } },
    data: { estado: "RETIRADA" },
  });
}

/** Fotos subidas en las últimas 24 horas (cualquiera sea su estado ahora). */
export async function contarFotosRecientes(usuarioId: string): Promise<number> {
  return prisma.fotoPerfil.count({
    where: { usuarioId, creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}

/**
 * La última foto de la cuenta, para su dueño. Si es RETIRADA, con el motivo
 * de la decisión que la retiró (la bitácora es la fuente).
 */
export async function ultimaFotoDe(usuarioId: string) {
  return prisma.fotoPerfil.findFirst({
    where: { usuarioId },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    select: {
      id: true,
      identificador: true,
      estado: true,
      finEn: true,
      decisiones: {
        where: { accion: "RETIRAR_FOTO_PERFIL" },
        orderBy: { creadoEn: "desc" },
        take: 1,
        select: { motivo: true },
      },
    },
  });
}

export type ResultadoFotoNueva =
  | { resultado: "creada"; foto: { id: string; identificador: string } }
  | { resultado: "limite" };

/**
 * Registra una foto nueva como la vigente, todo o nada:
 * 1. bloquea la fila del usuario (dos subidas simultáneas no se pisan ni
 *    esquivan el límite);
 * 2. revisa el límite de subidas en 24 horas;
 * 3. la vigente anterior, si había, pasa a ELIMINADA y sus reportes
 *    abiertos se cierran;
 * 4. crea la nueva;
 * 5. borra el archivo de la anterior. Si el proveedor falla, se revierte
 *    todo: nunca queda una foto «eliminada» con su archivo público vivo.
 */
export async function registrarFotoNueva(
  usuarioId: string,
  identificador: string,
  maximoDiario: number,
  eliminarArchivo: (identificador: string) => Promise<void>,
): Promise<ResultadoFotoNueva> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`;

      const recientes = await tx.fotoPerfil.count({
        where: { usuarioId, creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (recientes >= maximoDiario) return { resultado: "limite" } as const;

      const anterior = await tx.fotoPerfil.findFirst({
        where: { usuarioId, estado: "VIGENTE" },
        select: { id: true, identificador: true },
      });
      if (anterior) {
        await tx.fotoPerfil.update({ where: { id: anterior.id }, data: { estado: "ELIMINADA", finEn: new Date() } });
        await cerrarReportesDeFotoQueSeQuita(tx, anterior.id);
      }

      const foto = await tx.fotoPerfil.create({
        data: { usuarioId, identificador },
        select: { id: true, identificador: true },
      });

      if (anterior) await eliminarArchivo(anterior.identificador);
      return { resultado: "creada", foto };
    },
    // La llamada al proveedor cabe holgada; el valor por defecto (5 s) es justo.
    { timeout: 20_000 },
  );
}

/**
 * Quita la foto vigente (su dueño ya no quiere foto). Devuelve false si no
 * tenía. El archivo se borra dentro de la transacción, como al reemplazarla.
 */
export async function quitarFotoVigente(usuarioId: string, eliminarArchivo: (identificador: string) => Promise<void>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`;
      const vigente = await tx.fotoPerfil.findFirst({
        where: { usuarioId, estado: "VIGENTE" },
        select: { id: true, identificador: true },
      });
      if (!vigente) return false;

      await tx.fotoPerfil.update({ where: { id: vigente.id }, data: { estado: "ELIMINADA", finEn: new Date() } });
      await cerrarReportesDeFotoQueSeQuita(tx, vigente.id);
      await eliminarArchivo(vigente.identificador);
      return true;
    },
    { timeout: 20_000 },
  );
}

/** Lo necesario para decidir si alguien puede reportar esta foto. */
export async function buscarFotoReportable(id: string) {
  return prisma.fotoPerfil.findUnique({ where: { id }, select: { id: true, usuarioId: true, estado: true } });
}

export type ResultadoReporteFoto = "creado" | "ya_existia" | "limite";

/**
 * Crea el reporte de una foto con las mismas reglas, bajo bloqueo, que el de
 * un servicio: el límite diario es uno solo para todo lo que la persona
 * reporta, y hay uno abierto por persona y foto (además lo garantiza el
 * índice único parcial denuncias_una_abierta_por_persona_y_foto).
 */
export async function crearReporteFoto(
  datos: { denuncianteId: string; fotoPerfilId: string; motivo: MotivoDenuncia; comentario: string | null },
  maximoDiario: number,
): Promise<ResultadoReporteFoto> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${datos.denuncianteId} FOR UPDATE`;

      const recientes = await tx.denuncia.count({
        where: { denuncianteId: datos.denuncianteId, creadoEn: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (recientes >= maximoDiario) return "limite";

      const abierta = await tx.denuncia.findFirst({
        where: { denuncianteId: datos.denuncianteId, fotoPerfilId: datos.fotoPerfilId, estado: { in: [...ABIERTAS] } },
        select: { id: true },
      });
      if (abierta) return "ya_existia";

      await tx.denuncia.create({
        data: {
          denuncianteId: datos.denuncianteId,
          fotoPerfilId: datos.fotoPerfilId,
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

/**
 * Fotos VIGENTES con reportes abiertos: lo único que el panel muestra de las
 * fotos de perfil. Primero la que lleva más tiempo esperando; el id
 * desempata, así la paginación es estable.
 *
 * Los ids salen de una consulta fija con todos los valores como parámetros
 * ($queryRaw); el detalle se lee después con Prisma.
 */
export async function fotosReportadas(limite: number, desplazamiento: number) {
  const ordenadas = await prisma.$queryRaw<{ id: string; total: number }[]>`
    SELECT f.id, count(*) OVER ()::int AS total
      FROM fotos_perfil f
      JOIN denuncias d ON d.foto_perfil_id = f.id
     WHERE f.estado = 'VIGENTE' AND d.estado IN ('ABIERTA', 'EN_REVISION')
     GROUP BY f.id
     ORDER BY min(d.creado_en) ASC, f.id
     LIMIT ${limite}::int OFFSET ${desplazamiento}::int
  `;
  const ids = ordenadas.map((fila) => fila.id);
  if (ids.length === 0) return { fotos: [], total: 0 };

  const filas = await prisma.fotoPerfil.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      identificador: true,
      creadoEn: true,
      usuarioId: true,
      usuario: { select: { nombre: true, rol: true } },
      denuncias: {
        where: { estado: { in: [...ABIERTAS] } },
        orderBy: { creadoEn: "asc" },
        // De quien reportó, solo cuándo se creó su cuenta (el servicio lo
        // convierte en un booleano): nunca quién es.
        select: { id: true, motivo: true, detalle: true, creadoEn: true, denuncianteId: true, denunciante: { select: { creadoEn: true } } },
      },
    },
  });

  // Cuántas fotos de cada cuenta ya se retiraron antes: una señal para el
  // administrador de que no es la primera vez.
  const retiradas = await prisma.fotoPerfil.groupBy({
    by: ["usuarioId"],
    where: { usuarioId: { in: filas.map((fila) => fila.usuarioId) }, estado: "RETIRADA" },
    _count: { _all: true },
  });
  const retiradasPorUsuario = new Map(retiradas.map((grupo) => [grupo.usuarioId, grupo._count._all]));

  const porId = new Map(filas.map((fila) => [fila.id, fila]));
  return {
    fotos: ids.flatMap((id) => {
      const fila = porId.get(id);
      return fila ? [{ ...fila, retiradasAntes: retiradasPorUsuario.get(fila.usuarioId) ?? 0 }] : [];
    }),
    total: ordenadas[0]?.total ?? 0,
  };
}

export type ResultadoDecisionFoto = "hecho" | "sin_foto" | "sin_pendientes" | "no_vigente";

/**
 * Decisión sobre una foto reportada, todo o nada, como la de un servicio:
 * 1. bloquea la foto (dos administradores no deciden a la vez);
 * 2. cierra sus reportes abiertos, con el motivo y quién decidió;
 * 3. si la acción es retirar, la foto pasa a RETIRADA;
 * 4. inserta la decisión en la bitácora (solo inserción);
 * 5. si se retiró, borra el archivo del proveedor. Si falla, se revierte
 *    todo: nunca queda «retirada» con su URL pública viva.
 *
 * Retirar solo vale sobre la foto vigente; desestimar exige reportes abiertos.
 */
export async function registrarDecisionFoto(
  datos: { fotoPerfilId: string; administradorId: string; accion: "DESESTIMAR" | "RETIRAR_FOTO_PERFIL"; motivo: string },
  eliminarArchivo: (identificador: string) => Promise<void>,
): Promise<ResultadoDecisionFoto> {
  return prisma.$transaction(
    async (tx) => {
      const [foto] = await tx.$queryRaw<{ estado: string; identificador: string }[]>`
        SELECT estado::text AS estado, identificador FROM fotos_perfil WHERE id = ${datos.fotoPerfilId} FOR UPDATE`;
      if (!foto) return "sin_foto";
      if (datos.accion === "RETIRAR_FOTO_PERFIL" && foto.estado !== "VIGENTE") return "no_vigente";

      const ahora = new Date();
      const { count } = await tx.denuncia.updateMany({
        where: { fotoPerfilId: datos.fotoPerfilId, estado: { in: [...ABIERTAS] } },
        data: {
          estado: datos.accion === "DESESTIMAR" ? "DESESTIMADA" : "RESUELTA",
          resolucion: datos.motivo,
          resueltaPorId: datos.administradorId,
          resueltaEn: ahora,
        },
      });
      if (datos.accion === "DESESTIMAR" && count === 0) return "sin_pendientes";

      if (datos.accion === "RETIRAR_FOTO_PERFIL") {
        await tx.fotoPerfil.update({ where: { id: datos.fotoPerfilId }, data: { estado: "RETIRADA", finEn: ahora } });
      }

      await tx.decisionReporte.create({
        data: {
          fotoPerfilId: datos.fotoPerfilId,
          accion: datos.accion,
          motivo: datos.motivo,
          reportesCerrados: count,
          administradorId: datos.administradorId,
        },
      });

      if (datos.accion === "RETIRAR_FOTO_PERFIL") await eliminarArchivo(foto.identificador);
      return "hecho";
    },
    { timeout: 20_000 },
  );
}
