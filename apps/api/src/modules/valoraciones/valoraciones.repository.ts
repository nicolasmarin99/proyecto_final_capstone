import { prisma } from "../../db.js";
import { Prisma, type MotivoDenuncia } from "../../generated/prisma/client.js";

/** El perfil y su dueño: para saber si existe y si quien valora es el mismo prestador. */
export async function buscarPrestador(prestadorId: string) {
  return prisma.perfilPrestador.findUnique({ where: { id: prestadorId }, select: { id: true, usuarioId: true } });
}

export async function buscarPerfilDelUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: { id: true } });
}

/** El contacto más reciente de ese cliente con ese prestador: el plazo para valorar se cuenta desde él. */
export async function ultimoContacto(clienteId: string, prestadorId: string) {
  return prisma.contacto.findFirst({
    where: { clienteId, prestadorId },
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

export async function valoracionDe(clienteId: string, prestadorId: string) {
  return prisma.valoracion.findUnique({
    where: { clienteId_prestadorId: { clienteId, prestadorId } },
    select: { ...seleccionPropia, _count: { select: { denuncias: true } } },
  });
}

export type ResultadoGuardar =
  | { resultado: "creada" | "editada"; valoracion: Prisma.ValoracionGetPayload<{ select: typeof seleccionPropia }> }
  | { resultado: "oculta" };

/**
 * Crea o edita la valoración del par cliente-prestador, bajo bloqueo de la
 * fila del cliente: dos envíos simultáneos no crean dos (además lo impide el
 * UNIQUE (cliente_id, prestador_id)).
 *
 * - Nueva: queda enlazada al contacto que la habilita.
 * - Existente: cambia calificación y comentario, y se marca editada_en.
 *   El estado no se toca: una edición no despublica ni republica nada.
 * - Una valoración OCULTA por moderación no se edita: editarla no puede ser
 *   la forma de sacarla de la moderación.
 */
export async function guardarValoracion(datos: {
  clienteId: string;
  prestadorId: string;
  contactoId: string;
  calificacion: number;
  comentario: string | null;
}): Promise<ResultadoGuardar> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${datos.clienteId} FOR UPDATE`;

    const existente = await tx.valoracion.findUnique({
      where: { clienteId_prestadorId: { clienteId: datos.clienteId, prestadorId: datos.prestadorId } },
      select: { id: true, estado: true },
    });

    if (!existente) {
      const valoracion = await tx.valoracion.create({
        data: {
          contactoId: datos.contactoId,
          clienteId: datos.clienteId,
          prestadorId: datos.prestadorId,
          calificacion: datos.calificacion,
          comentario: datos.comentario,
        },
        select: seleccionPropia,
      });
      return { resultado: "creada", valoracion };
    }

    if (existente.estado === "OCULTA") return { resultado: "oculta" };

    const valoracion = await tx.valoracion.update({
      where: { id: existente.id },
      data: { calificacion: datos.calificacion, comentario: datos.comentario, editadaEn: new Date() },
      select: seleccionPropia,
    });
    return { resultado: "editada", valoracion };
  });
}

export type ResultadoRetiro = "retirada" | "no_existe" | "en_moderacion";

/**
 * El cliente retira su valoración: se borra. Si tiene una objeción (abierta
 * o ya decidida) no se borra: la evidencia de la moderación se conserva, y
 * las claves foráneas RESTRICT de denuncias y decisiones_reporte también lo
 * impedirían.
 */
export async function retirarValoracion(clienteId: string, prestadorId: string): Promise<ResultadoRetiro> {
  return prisma.$transaction(async (tx) => {
    const valoracion = await tx.valoracion.findUnique({
      where: { clienteId_prestadorId: { clienteId, prestadorId } },
      select: { id: true, _count: { select: { denuncias: true, decisiones: true } } },
    });
    if (!valoracion) return "no_existe";
    if (valoracion._count.denuncias > 0 || valoracion._count.decisiones > 0) return "en_moderacion";

    await tx.valoracion.delete({ where: { id: valoracion.id } });
    return "retirada";
  });
}

/**
 * Lista pública: solo PUBLICADAS, más recientes primero. Del cliente se lee
 * únicamente el nombre, que el servicio recorta al nombre de pila: nunca el
 * correo ni el RUT.
 */
export async function valoracionesPublicadas(prestadorId: string, pagina: number, porPagina: number) {
  const where = { prestadorId, estado: "PUBLICADA" as const };
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
