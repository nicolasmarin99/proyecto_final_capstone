import { prisma } from "../../db.js";
import { Prisma, type MotivoDenuncia } from "../../generated/prisma/client.js";

/** El perfil y su dueño: para saber si existe. */
export async function buscarPrestador(prestadorId: string) {
  return prisma.perfilPrestador.findUnique({ where: { id: prestadorId }, select: { id: true, usuarioId: true } });
}

/** El servicio, su prestador y el dueño: para saber si quien valora es el mismo prestador. */
export async function buscarServicio(servicioId: string) {
  return prisma.servicio.findUnique({
    where: { id: servicioId },
    select: { id: true, prestadorId: true, prestador: { select: { usuarioId: true } } },
  });
}

export async function buscarPerfilDelUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: { id: true } });
}

/**
 * El contacto más reciente de ese cliente POR ESE SERVICIO: el plazo para
 * valorarlo se cuenta desde él. Un contacto por otro servicio del mismo
 * prestador no sirve.
 */
export async function ultimoContacto(clienteId: string, servicioId: string) {
  return prisma.contacto.findFirst({
    where: { clienteId, servicioId },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    select: { id: true, creadoEn: true },
  });
}

/** Lo que el cliente ve de su propia valoración. */
const seleccionPropia = {
  id: true,
  calificacion: true,
  comentario: true,
  estado: true,
  creadoEn: true,
  editadaEn: true,
} as const;

export async function valoracionDe(clienteId: string, servicioId: string) {
  return prisma.valoracion.findUnique({
    where: { clienteId_servicioId: { clienteId, servicioId } },
    select: seleccionPropia,
  });
}

export type ResultadoCrear =
  | { resultado: "creada"; valoracion: Prisma.ValoracionGetPayload<{ select: typeof seleccionPropia }> }
  | { resultado: "ya_existe" };

/**
 * Crea la valoración del par cliente-servicio, enlazada al contacto que la
 * habilita, bajo bloqueo de la fila del cliente: dos envíos simultáneos no
 * crean dos (además lo impide el UNIQUE (cliente_id, servicio_id)).
 *
 * Es DEFINITIVA: si ya existe no se toca y se informa "ya_existe". En este
 * repositorio no hay ninguna función que edite ni borre una valoración, y la
 * base además rechaza cambiar su contenido (trigger
 * valoraciones_contenido_inmutable).
 */
export async function crearValoracion(datos: {
  clienteId: string;
  prestadorId: string;
  servicioId: string;
  contactoId: string;
  calificacion: number;
  comentario: string | null;
}): Promise<ResultadoCrear> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${datos.clienteId} FOR UPDATE`;

    const existente = await tx.valoracion.findUnique({
      where: { clienteId_servicioId: { clienteId: datos.clienteId, servicioId: datos.servicioId } },
      select: { id: true },
    });
    if (existente) return { resultado: "ya_existe" };

    const valoracion = await tx.valoracion.create({
      data: {
        contactoId: datos.contactoId,
        clienteId: datos.clienteId,
        prestadorId: datos.prestadorId,
        servicioId: datos.servicioId,
        calificacion: datos.calificacion,
        comentario: datos.comentario,
      },
      select: seleccionPropia,
    });
    return { resultado: "creada", valoracion };
  });
}

/**
 * Lista pública de un servicio o de un prestador (todos sus servicios):
 * solo PUBLICADAS, más recientes primero. Del cliente se lee únicamente el
 * nombre, que el servicio recorta al nombre de pila: nunca el correo ni el
 * RUT. Cada una dice qué servicio valora.
 */
export async function valoracionesPublicadas(
  alcance: { servicioId: string } | { prestadorId: string },
  pagina: number,
  porPagina: number,
) {
  const where = { ...alcance, estado: "PUBLICADA" as const };
  const [valoraciones, total] = await Promise.all([
    prisma.valoracion.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        calificacion: true,
        comentario: true,
        creadoEn: true,
        editadaEn: true,
        servicio: { select: { id: true, titulo: true } },
        // valoraciones llega al cliente por su contacto (clave compuesta).
        contacto: { select: { cliente: { select: { nombre: true } } } },
      },
    }),
    prisma.valoracion.count({ where }),
  ]);
  return { valoraciones, total };
}

/**
 * Las valoraciones que recibió un prestador, publicadas u ocultas, con el
 * estado de su objeción y, si se ocultó, el motivo de la decisión.
 */
export async function valoracionesRecibidas(prestadorId: string, pagina: number, porPagina: number) {
  const where = { prestadorId };
  const [valoraciones, total] = await Promise.all([
    prisma.valoracion.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        calificacion: true,
        comentario: true,
        estado: true,
        creadoEn: true,
        editadaEn: true,
        servicio: { select: { id: true, titulo: true } },
        // valoraciones llega al cliente por su contacto (clave compuesta).
        contacto: { select: { cliente: { select: { nombre: true } } } },
        denuncias: {
          take: 1,
          select: { motivo: true, detalle: true, estado: true, resolucion: true, resueltaEn: true, creadoEn: true },
        },
        decisiones: {
          where: { accion: "OCULTAR_VALORACION" },
          orderBy: { creadoEn: "desc" },
          take: 1,
          select: { motivo: true, creadoEn: true },
        },
      },
    }),
    prisma.valoracion.count({ where }),
  ]);
  return { valoraciones, total };
}

/** Lo necesario para decidir si un prestador puede objetar esta valoración. */
export async function buscarValoracion(id: string) {
  return prisma.valoracion.findUnique({
    where: { id },
    select: { id: true, estado: true, contacto: { select: { prestador: { select: { usuarioId: true } } } } },
  });
}

/**
 * Registra la objeción: una denuncia con valoracion_id. Una sola por
 * valoración, en cualquier estado (índice único denuncias_una_por_valoracion).
 */
export async function crearObjecion(datos: {
  valoracionId: string;
  denuncianteId: string;
  motivo: MotivoDenuncia;
  comentario: string | null;
}): Promise<"creada" | "ya_objetada"> {
  try {
    await prisma.denuncia.create({
      data: {
        valoracionId: datos.valoracionId,
        denuncianteId: datos.denuncianteId,
        motivo: datos.motivo,
        detalle: datos.comentario,
      },
    });
    return "creada";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "ya_objetada";
    throw error;
  }
}
