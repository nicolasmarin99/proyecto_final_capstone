import { prisma } from "../../db.js";
import { Prisma, type EstadoCredencial } from "../../generated/prisma/client.js";

/** El tipo de la cédula. Todo lo de este módulo lo excluye: la identidad tiene su propio flujo. */
const CODIGO_IDENTIDAD = "IDENTIDAD";
const noEsIdentidad = { tipo: { codigo: { not: CODIGO_IDENTIDAD } } } as const;

/** Lo que el prestador ve de cada certificación suya. Nunca nada del archivo. */
const seleccionPropia = {
  id: true,
  estado: true,
  identificadorDocumento: true,
  vigenteHasta: true,
  fechaTermino: true,
  horas: true,
  nombrePersonalizado: true,
  emisorPersonalizado: true,
  motivoRechazo: true,
  creadoEn: true,
  fechaConsulta: true,
  tipo: { select: { codigo: true, nombre: true, fuenteOficial: true } },
} as const;

/** El catálogo que se ofrece en el formulario: los tipos activos, menos la cédula. */
export async function tiposCertificables() {
  return prisma.tipoCredencial.findMany({
    where: { activo: true, codigo: { not: CODIGO_IDENTIDAD } },
    orderBy: { nombre: "asc" },
    select: { id: true, codigo: true, nombre: true, fuenteOficial: true, requiereVigencia: true },
  });
}

export async function buscarPerfilDelUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: { id: true } });
}

export type ResultadoEnvio = "permitido" | "pendiente" | "limite";

interface DatosEnvio {
  id: string;
  prestadorId: string;
  tipoId: string;
  identificador: string | null;
  vigenteHasta: Date | null;
  fechaTermino: Date | null;
  horas: number | null;
  nombre: string | null;
  emisor: string | null;
  autorId: string;
  limite: { maximo: number; desde: Date };
}

/** Clave de «la misma certificación»: el tipo y, con OTRA, el nombre normalizado (igual que el índice único). */
function mismaCertificacion(prestadorId: string, tipoId: string, nombre: string | null) {
  return {
    prestadorId,
    tipoId,
    nombrePersonalizado: nombre === null ? null : { equals: nombre.trim(), mode: Prisma.QueryMode.insensitive },
  };
}

async function revisar(cliente: Pick<typeof prisma, "credencial">, datos: Omit<DatosEnvio, "id" | "identificador" | "vigenteHasta" | "fechaTermino" | "horas" | "emisor" | "autorId">): Promise<ResultadoEnvio> {
  const pendiente = await cliente.credencial.findFirst({
    where: { ...mismaCertificacion(datos.prestadorId, datos.tipoId, datos.nombre), estado: "PENDIENTE" },
    select: { id: true },
  });
  if (pendiente) return "pendiente";

  const recientes = await cliente.credencial.count({
    where: { prestadorId: datos.prestadorId, ...noEsIdentidad, creadoEn: { gte: datos.limite.desde } },
  });
  return recientes >= datos.limite.maximo ? "limite" : "permitido";
}

/** Revisión previa, fuera de transacción: evita subir un archivo que igual se rechazaría. */
export async function revisarEnvio(datos: Omit<DatosEnvio, "id" | "identificador" | "vigenteHasta" | "fechaTermino" | "horas" | "emisor" | "autorId">) {
  return revisar(prisma, datos);
}

/**
 * Crea la certificación PENDIENTE y su primer evento, si todavía corresponde.
 * El FOR UPDATE sobre el perfil serializa los envíos del mismo prestador:
 * dos simultáneos no pasan juntos el límite ni duplican una pendiente.
 */
export async function registrarEnvio(datos: DatosEnvio) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM perfiles_prestador WHERE id = ${datos.prestadorId} FOR UPDATE`;

      const resultado = await revisar(tx, datos);
      if (resultado !== "permitido") return { resultado, certificacion: null };

      const certificacion = await tx.credencial.create({
        data: {
          id: datos.id,
          prestadorId: datos.prestadorId,
          tipoId: datos.tipoId,
          identificadorDocumento: datos.identificador,
          vigenteHasta: datos.vigenteHasta,
          fechaTermino: datos.fechaTermino,
          horas: datos.horas,
          nombrePersonalizado: datos.nombre,
          emisorPersonalizado: datos.emisor,
        },
        select: seleccionPropia,
      });
      await tx.eventoCredencial.create({
        data: { credencialId: datos.id, estadoAnterior: null, estadoNuevo: "PENDIENTE", autorId: datos.autorId },
      });
      return { resultado, certificacion };
    });
  } catch (error) {
    // Defensa en profundidad: el índice credenciales_una_pendiente_por_tipo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { resultado: "pendiente" as const, certificacion: null };
    }
    throw error;
  }
}

/** Las certificaciones del prestador, más recientes primero (sin las reemplazadas por una renovación). */
export async function certificacionesDe(prestadorId: string) {
  return prisma.credencial.findMany({
    where: { prestadorId, ...noEsIdentidad, estado: { not: "REVOCADA" } },
    orderBy: { creadoEn: "desc" },
    select: seleccionPropia,
  });
}

/** Cola de revisión. Incluye nombre y RUT de la cuenta: el administrador los compara con el documento. */
export async function colaCertificaciones(estado: EstadoCredencial, pagina: number, porPagina: number) {
  const where = { ...noEsIdentidad, estado };
  const [certificaciones, total] = await Promise.all([
    prisma.credencial.findMany({
      where,
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        ...seleccionPropia,
        prestador: { select: { id: true, usuario: { select: { nombre: true, rut: true } } } },
      },
    }),
    prisma.credencial.count({ where }),
  ]);
  return { certificaciones, total };
}

export async function buscarCertificacion(id: string) {
  return prisma.credencial.findFirst({ where: { id, ...noEsIdentidad }, select: { id: true, estado: true } });
}

export async function registrarAccesoDocumento(credencialId: string, administradorId: string) {
  await prisma.accesoDocumento.create({ data: { credencialId, administradorId } });
}

export type DecisionCertificacion =
  | { estado: "VERIFICADA"; administradorId: string }
  | { estado: "RECHAZADA"; administradorId: string; motivo: string };

/**
 * Aprueba o rechaza una certificación PENDIENTE, todo o nada:
 * 1. Si se aprueba y ya había una VERIFICADA de la misma certificación (una
 *    renovación), la anterior pasa a REVOCADA, con su evento, y la nueva la
 *    reemplaza (reemplazaAId). Va antes porque el índice único no admite dos
 *    VERIFICADA a la vez.
 * 2. La pendiente cambia de estado, con su evento.
 * 3. antesDeConfirmar borra el documento del almacenamiento: si falla, todo
 *    se revierte y la certificación sigue pendiente, con su archivo.
 */
export async function resolverCertificacion(id: string, decision: DecisionCertificacion, antesDeConfirmar: () => Promise<void>) {
  return prisma.$transaction(async (tx) => {
    const pendiente = await tx.credencial.findFirst({
      where: { id, ...noEsIdentidad, estado: "PENDIENTE" },
      select: { prestadorId: true, tipoId: true, nombrePersonalizado: true },
    });
    if (!pendiente) return null;

    let reemplazaAId: string | null = null;
    if (decision.estado === "VERIFICADA") {
      const anterior = await tx.credencial.findFirst({
        where: { ...mismaCertificacion(pendiente.prestadorId, pendiente.tipoId, pendiente.nombrePersonalizado), estado: "VERIFICADA" },
        select: { id: true },
      });
      if (anterior) {
        await tx.credencial.update({ where: { id: anterior.id }, data: { estado: "REVOCADA" } });
        await tx.eventoCredencial.create({
          data: {
            credencialId: anterior.id,
            estadoAnterior: "VERIFICADA",
            estadoNuevo: "REVOCADA",
            autorId: decision.administradorId,
            motivo: "Reemplazada por una renovación aprobada.",
          },
        });
        reemplazaAId = anterior.id;
      }
    }

    const { count } = await tx.credencial.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: {
        estado: decision.estado,
        metodo: "MANUAL",
        fechaConsulta: new Date(),
        verificadoPorId: decision.administradorId,
        fuente: "Revisión manual del documento por un administrador",
        motivoRechazo: decision.estado === "RECHAZADA" ? decision.motivo : null,
        reemplazaAId,
      },
    });
    if (count === 0) return null;

    await tx.eventoCredencial.create({
      data: {
        credencialId: id,
        estadoAnterior: "PENDIENTE",
        estadoNuevo: decision.estado,
        autorId: decision.administradorId,
        motivo: decision.estado === "RECHAZADA" ? decision.motivo : null,
      },
    });

    await antesDeConfirmar();

    return tx.credencial.findUniqueOrThrow({ where: { id }, select: seleccionPropia });
  });
}
