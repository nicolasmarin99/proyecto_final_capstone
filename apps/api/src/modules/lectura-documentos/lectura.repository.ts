import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";
import { soloCamposPermitidos, type CampoExtraido, type CampoLectura, type TipoDocumentoLectura } from "./lectura.tipos.js";

/*
  Este repositorio escribe en extracciones_documento y en
  revisiones_extraccion, y en ninguna otra tabla. En particular, NO escribe
  en credenciales: la lectura automática no puede cambiar el estado de una
  credencial (lo comprueba tests/integration/lectura.documentos.test.ts).
*/

/** Intentos de lectura por documento, contando el primero. Después queda FALLIDA para siempre. */
export const MAXIMO_INTENTOS = 3;

/** Deja registrada la extracción como PENDIENTE. Si ya existía, no hace nada. */
export async function crearPendiente(credencialId: string, tipo: TipoDocumentoLectura): Promise<void> {
  try {
    await prisma.extraccionDocumento.create({ data: { credencialId, tipo } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

/** La extracción y lo necesario para procesarla: si la credencial sigue pendiente y de qué tipo es. */
export async function buscarParaProcesar(credencialId: string) {
  return prisma.extraccionDocumento.findUnique({
    where: { credencialId },
    select: {
      id: true,
      tipo: true,
      estado: true,
      intentos: true,
      credencial: { select: { estado: true, tipo: { select: { codigo: true } } } },
    },
  });
}

/**
 * Toma la extracción para un intento: suma uno a `intentos` solo si sigue
 * sin extraer y le quedan intentos. Devuelve false si no había nada que
 * tomar (ya extraída, sin intentos, o borrada porque se resolvió).
 */
export async function tomarParaIntento(id: string): Promise<boolean> {
  const { count } = await prisma.extraccionDocumento.updateMany({
    where: { id, estado: { in: ["PENDIENTE", "FALLIDA"] }, intentos: { lt: MAXIMO_INTENTOS } },
    data: { intentos: { increment: 1 } },
  });
  return count === 1;
}

export async function guardarExtraida(id: string, campos: CampoExtraido[], modelo: string): Promise<void> {
  // updateMany: si la solicitud se resolvió mientras se leía, la fila ya no
  // existe y no hay nada que guardar (no es un error).
  await prisma.extraccionDocumento.updateMany({
    where: { id, estado: { not: "EXTRAIDA" } },
    data: { estado: "EXTRAIDA", campos: campos as unknown as Prisma.InputJsonValue, modelo, extraidaEn: new Date(), error: null },
  });
}

export async function guardarFallida(id: string, motivo: string): Promise<void> {
  await prisma.extraccionDocumento.updateMany({
    where: { id, estado: { not: "EXTRAIDA" } },
    data: { estado: "FALLIDA", error: motivo.slice(0, 200) },
  });
}

/**
 * Credenciales PENDIENTES de revisión cuyo documento todavía no se leyó y
 * se puede intentar: sin extracción registrada, o con una PENDIENTE o
 * FALLIDA a la que le quedan intentos. Las más antiguas primero.
 */
export async function credencialesPorLeer(limite: number) {
  return prisma.credencial.findMany({
    where: {
      estado: "PENDIENTE",
      OR: [{ extraccion: null }, { extraccion: { estado: { in: ["PENDIENTE", "FALLIDA"] }, intentos: { lt: MAXIMO_INTENTOS } } }],
    },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    take: limite,
    select: { id: true, tipo: { select: { codigo: true } } },
  });
}

/** La extracción de una credencial, con lo que declaró el prestador (para la validación cruzada). */
export async function extraccionConDeclarado(credencialId: string) {
  return prisma.credencial.findUnique({
    where: { id: credencialId },
    select: {
      id: true,
      estado: true,
      prestador: { select: { usuario: { select: { nombre: true, rut: true } } } },
      extraccion: { select: { tipo: true, estado: true, campos: true, modelo: true, extraidaEn: true, creadoEn: true } },
    },
  });
}

/** Lee el JSON guardado con el mismo filtro con que se escribió: nunca sale un campo no permitido. */
export function camposGuardados(tipo: TipoDocumentoLectura, campos: Prisma.JsonValue | null): CampoExtraido[] {
  return Array.isArray(campos) ? soloCamposPermitidos(tipo, campos) : [];
}

/** Lo que hizo el administrador con un campo leído. */
export interface RevisionCampo {
  campo: CampoLectura;
  resultado: "ACEPTADO" | "CORREGIDO";
}

/** Se intentó aprobar sin haber confirmado o corregido cada campo leído. */
export class RevisionIncompleta extends Error {
  constructor(readonly faltan: CampoLectura[]) {
    super("Faltan campos de la lectura automática por confirmar o corregir.");
    this.name = "RevisionIncompleta";
  }
}

/**
 * Cierra la extracción de una credencial AL RESOLVERLA, dentro de la misma
 * transacción en que el administrador la aprueba o rechaza y se borra el
 * documento:
 *
 * 1. Para APROBAR, si hay campos leídos, el administrador tiene que haber
 *    confirmado o corregido cada uno (RevisionIncompleta si no). Es la
 *    fricción intencional: la lectura no se acepta en bloque.
 * 2. Registra, por cada campo revisado, si se aceptó o se corrigió: sin el
 *    valor y sin vínculo con la credencial (ver revisiones_extraccion).
 * 3. BORRA la extracción. Lo leído del documento (el RUT de una cédula, por
 *    ejemplo) no sobrevive al documento.
 *
 * Esta función no decide ni cambia el estado de la credencial: la llama
 * quien ya lo está cambiando por decisión de un administrador.
 */
export async function cerrarExtraccion(
  tx: Prisma.TransactionClient,
  credencialId: string,
  decision: "VERIFICADA" | "RECHAZADA",
  revision: readonly RevisionCampo[] | undefined,
): Promise<void> {
  const extraccion = await tx.extraccionDocumento.findUnique({
    where: { credencialId },
    select: { id: true, tipo: true, estado: true, campos: true, modelo: true },
  });
  if (!extraccion) return;

  if (extraccion.estado === "EXTRAIDA") {
    const campos = camposGuardados(extraccion.tipo, extraccion.campos);
    const resultados = new Map((revision ?? []).map((fila) => [fila.campo, fila.resultado]));

    if (decision === "VERIFICADA") {
      const faltan = campos.filter((campo) => !resultados.has(campo.campo)).map((campo) => campo.campo);
      if (faltan.length > 0) throw new RevisionIncompleta(faltan);
    }

    const lote = randomUUID();
    const filas = campos.flatMap((campo) => {
      const resultado = resultados.get(campo.campo);
      return resultado
        ? [{ lote, tipoDocumento: extraccion.tipo, campo: campo.campo, confianza: campo.confianza, resultado, modelo: extraccion.modelo ?? "desconocido", decision }]
        : [];
    });
    if (filas.length > 0) await tx.revisionExtraccion.createMany({ data: filas });
  }

  await tx.extraccionDocumento.delete({ where: { id: extraccion.id } });
}
