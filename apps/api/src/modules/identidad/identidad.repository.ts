import { prisma } from "../../db.js";
import type { EstadoCredencial } from "../../generated/prisma/client.js";

/** Código del tipo de credencial que carga el seed de datos maestros. */
export const CODIGO_IDENTIDAD = "IDENTIDAD";

const deIdentidad = { tipo: { codigo: CODIGO_IDENTIDAD } } as const;

/** Lo que ve el propio prestador: estado y motivo. Nunca nada del archivo. */
const seleccionEstado = {
  id: true,
  estado: true,
  motivoRechazo: true,
  creadoEn: true,
  fechaConsulta: true,
} as const;

export async function buscarPerfilDelUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({
    where: { usuarioId },
    select: { id: true, usuario: { select: { rut: true } } },
  });
}

export async function buscarTipoIdentidad() {
  return prisma.tipoCredencial.findUnique({ where: { codigo: CODIGO_IDENTIDAD }, select: { id: true } });
}

export type ResultadoRevisionCarga = "permitida" | "pendiente" | "verificada" | "limite";

/** Mismas reglas dentro y fuera de la transacción: ver registrarCarga. */
async function revisar(
  cliente: Pick<typeof prisma, "credencial">,
  prestadorId: string,
  limite: { maximo: number; desde: Date },
): Promise<ResultadoRevisionCarga> {
  const abierta = await cliente.credencial.findFirst({
    where: { prestadorId, ...deIdentidad, estado: { in: ["PENDIENTE", "VERIFICADA"] } },
    select: { estado: true },
  });

  if (abierta?.estado === "PENDIENTE") return "pendiente";
  if (abierta?.estado === "VERIFICADA") return "verificada";

  // Cada carga crea una credencial, así que contarlas es contar las cargas.
  const recientes = await cliente.credencial.count({
    where: { prestadorId, ...deIdentidad, creadoEn: { gte: limite.desde } },
  });

  return recientes >= limite.maximo ? "limite" : "permitida";
}

/** Revisión previa, fuera de transacción: evita subir un archivo que igual se rechazaría. */
export async function revisarCarga(prestadorId: string, limite: { maximo: number; desde: Date }) {
  return revisar(prisma, prestadorId, limite);
}

/**
 * Crea la credencial PENDIENTE y su primer evento, si todavía corresponde.
 *
 * Bloquea la fila del perfil (SELECT ... FOR UPDATE) antes de revisar: dos
 * cargas simultáneas del mismo prestador se ejecutan una después de la otra,
 * y la segunda ve la pendiente que dejó la primera. Sin el bloqueo, las dos
 * pasarían la revisión y quedarían dos pendientes, o se saltaría el límite.
 */
export async function registrarCarga(datos: {
  id: string;
  prestadorId: string;
  tipoId: string;
  identificadorDocumento: string;
  autorId: string;
  limite: { maximo: number; desde: Date };
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM perfiles_prestador WHERE id = ${datos.prestadorId} FOR UPDATE`;

    const resultado = await revisar(tx, datos.prestadorId, datos.limite);

    if (resultado !== "permitida") {
      return { resultado, credencial: null };
    }

    const credencial = await tx.credencial.create({
      data: {
        id: datos.id,
        prestadorId: datos.prestadorId,
        tipoId: datos.tipoId,
        identificadorDocumento: datos.identificadorDocumento,
      },
      select: seleccionEstado,
    });

    await tx.eventoCredencial.create({
      data: { credencialId: credencial.id, estadoNuevo: "PENDIENTE", autorId: datos.autorId },
    });

    return { resultado, credencial };
  });
}

/** La verificación más reciente del prestador, o null si nunca subió nada. */
export async function buscarUltimaIdentidad(prestadorId: string) {
  return prisma.credencial.findFirst({
    where: { prestadorId, ...deIdentidad },
    orderBy: { creadoEn: "desc" },
    select: seleccionEstado,
  });
}

export async function contarCargasDesde(prestadorId: string, desde: Date) {
  return prisma.credencial.count({ where: { prestadorId, ...deIdentidad, creadoEn: { gte: desde } } });
}

/**
 * Cola de revisión. Las más antiguas primero: quien esperó más se atiende antes.
 *
 * Trae lo mínimo para decidir: nombre y RUT (lo que se compara con la
 * cédula) y la comuna. Ni el correo ni el teléfono hacen falta.
 */
export async function listarIdentidades(estado: EstadoCredencial, salto: number, cantidad: number) {
  const where = { ...deIdentidad, estado };

  const [filas, total] = await Promise.all([
    prisma.credencial.findMany({
      where,
      orderBy: { creadoEn: "asc" },
      skip: salto,
      take: cantidad,
      select: {
        ...seleccionEstado,
        prestador: {
          select: {
            comuna: { select: { nombre: true } },
            usuario: { select: { nombre: true, rut: true } },
          },
        },
      },
    }),
    prisma.credencial.count({ where }),
  ]);

  return { filas, total };
}

export async function buscarIdentidad(id: string) {
  return prisma.credencial.findFirst({ where: { id, ...deIdentidad }, select: { id: true, estado: true } });
}

/** Bitácora de solo inserción (accesos_documento). Nunca recibe la URL. */
export async function registrarAccesoDocumento(credencialId: string, administradorId: string) {
  await prisma.accesoDocumento.create({ data: { credencialId, administradorId } });
}

export type DecisionIdentidad =
  | { estado: "VERIFICADA"; administradorId: string }
  | { estado: "RECHAZADA"; administradorId: string; motivo: string };

/**
 * Aprueba o rechaza una identidad PENDIENTE, en una sola transacción:
 * cambia el estado, registra el evento, marca el RUT como verificado si se
 * aprueba y, al final, ejecuta `antesDeConfirmar` (la eliminación del archivo).
 *
 * Si eliminar el archivo falla, la transacción se revierte y la identidad
 * sigue pendiente: es preferible poder reintentar a dar por verificada una
 * identidad cuyo documento sigue guardado.
 *
 * El UPDATE filtra por estado PENDIENTE: si dos administradores deciden a la
 * vez, solo el primero cambia una fila. Devuelve null si no había nada
 * pendiente con ese id.
 */
export async function resolverIdentidad(
  id: string,
  decision: DecisionIdentidad,
  antesDeConfirmar: () => Promise<void>,
) {
  return prisma.$transaction(async (tx) => {
    const ahora = new Date();
    const { count } = await tx.credencial.updateMany({
      where: { id, ...deIdentidad, estado: "PENDIENTE" },
      data: {
        estado: decision.estado,
        metodo: "MANUAL",
        fechaConsulta: ahora,
        verificadoPorId: decision.administradorId,
        fuente: "Revisión manual del documento por un administrador",
        motivoRechazo: decision.estado === "RECHAZADA" ? decision.motivo : null,
      },
    });

    if (count === 0) {
      return null;
    }

    await tx.eventoCredencial.create({
      data: {
        credencialId: id,
        estadoAnterior: "PENDIENTE",
        estadoNuevo: decision.estado,
        autorId: decision.administradorId,
        motivo: decision.estado === "RECHAZADA" ? decision.motivo : null,
      },
    });

    const credencial = await tx.credencial.findUniqueOrThrow({
      where: { id },
      select: { ...seleccionEstado, prestador: { select: { usuarioId: true } } },
    });

    if (decision.estado === "VERIFICADA") {
      await tx.usuario.update({ where: { id: credencial.prestador.usuarioId }, data: { rutVerificado: true } });
    }

    await antesDeConfirmar();

    return credencial;
  });
}
