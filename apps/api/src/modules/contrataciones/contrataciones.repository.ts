import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";

/*
  ÚNICO archivo que lee o escribe la tabla contrataciones. Toda consulta de
  lectura filtra por clienteId, el dueño: no hay ninguna que liste por
  servicio ni por prestador para mostrársela a otro. Una prueba recorre el
  código fuente y exige que nadie más toque el modelo.
*/

/** Lo que el cliente ve de cada registro suyo. */
const seleccion = {
  id: true,
  clienteId: true,
  servicioId: true,
  prestadorId: true,
  fechaContratacion: true,
  tituloServicio: true,
  nombrePrestador: true,
  notas: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export type FilaContratacion = Prisma.ContratacionGetPayload<{ select: typeof seleccion }>;

/** El servicio, su prestador y el nombre que se copia. */
export async function buscarServicio(servicioId: string) {
  return prisma.servicio.findUnique({
    where: { id: servicioId },
    select: {
      id: true,
      titulo: true,
      prestadorId: true,
      prestador: { select: { usuarioId: true, usuario: { select: { nombre: true } } } },
    },
  });
}

/** ¿Ese cliente contactó alguna vez a ese prestador desde LocalCL (por cualquiera de sus servicios)? */
export async function tieneContactoCon(clienteId: string, prestadorId: string): Promise<boolean> {
  return (await prisma.contacto.count({ where: { clienteId, prestadorId } })) > 0;
}

/** «AAAA-MM-DD» → la medianoche UTC de ese día, que es como Prisma escribe un DATE. */
function comoFecha(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

export type ResultadoEscritura =
  | { resultado: "ok"; contratacion: FilaContratacion }
  | { resultado: "duplicada" }
  | { resultado: "no_existe" };

function esDuplicada(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** La fila se borró entre la revisión y la escritura (o no era del cliente). */
function noExiste(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function crearContratacion(datos: {
  clienteId: string;
  servicioId: string;
  prestadorId: string;
  fechaContratacion: string;
  tituloServicio: string;
  nombrePrestador: string;
  notas: string | null;
}): Promise<ResultadoEscritura> {
  try {
    const contratacion = await prisma.contratacion.create({
      data: { ...datos, fechaContratacion: comoFecha(datos.fechaContratacion) },
      select: seleccion,
    });
    return { resultado: "ok", contratacion };
  } catch (error) {
    if (esDuplicada(error)) return { resultado: "duplicada" };
    throw error;
  }
}

/** Por id, con su dueño: el servicio decide si quien pide es el dueño. */
export async function buscarContratacion(id: string) {
  return prisma.contratacion.findUnique({ where: { id }, select: { id: true, clienteId: true } });
}

/**
 * Edita fecha y notas. El `where` lleva también el clienteId: aunque el
 * servicio ya revisó el dueño, una fila ajena nunca se toca.
 */
export async function actualizarContratacion(
  id: string,
  clienteId: string,
  cambios: { fechaContratacion?: string; notas?: string | null },
): Promise<ResultadoEscritura> {
  try {
    const contratacion = await prisma.contratacion.update({
      where: { id, clienteId },
      data: {
        ...(cambios.fechaContratacion !== undefined ? { fechaContratacion: comoFecha(cambios.fechaContratacion) } : {}),
        ...(cambios.notas !== undefined ? { notas: cambios.notas } : {}),
      },
      select: seleccion,
    });
    return { resultado: "ok", contratacion };
  } catch (error) {
    if (esDuplicada(error)) return { resultado: "duplicada" };
    if (noExiste(error)) return { resultado: "no_existe" };
    throw error;
  }
}

/** Borra la fila solo si es de ese cliente. false: ya no estaba. */
export async function eliminarContratacion(id: string, clienteId: string): Promise<boolean> {
  const { count } = await prisma.contratacion.deleteMany({ where: { id, clienteId } });
  return count > 0;
}

/** Las del cliente, por fecha de contratación (la más reciente primero). */
export async function contratacionesDe(clienteId: string, pagina: number, porPagina: number) {
  const where = { clienteId };
  const [contrataciones, total] = await Promise.all([
    prisma.contratacion.findMany({
      where,
      orderBy: [{ fechaContratacion: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: seleccion,
    }),
    prisma.contratacion.count({ where }),
  ]);
  return { contrataciones, total };
}

/** Las del cliente para UN servicio: para la página de ese servicio. */
export async function contratacionesDeServicio(clienteId: string, servicioId: string) {
  return prisma.contratacion.findMany({
    where: { clienteId, servicioId },
    orderBy: [{ fechaContratacion: "desc" }, { id: "desc" }],
    select: seleccion,
  });
}

/** De esos servicios, cuáles valoró el cliente y con qué id. */
export async function valoracionesDelClienteEn(clienteId: string, servicioIds: string[]) {
  if (servicioIds.length === 0) return new Map<string, string>();
  const valoraciones = await prisma.valoracion.findMany({
    where: { clienteId, servicioId: { in: servicioIds } },
    select: { id: true, servicioId: true },
  });
  return new Map(valoraciones.map((valoracion) => [valoracion.servicioId, valoracion.id]));
}
