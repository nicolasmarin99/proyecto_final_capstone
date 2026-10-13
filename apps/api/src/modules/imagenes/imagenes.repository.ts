import { prisma } from "../../db.js";
import type { EstadoImagen } from "../../generated/prisma/client.js";

/** Lo que se lee de cada imagen. El motivo de una oculta está en la bitácora (ver motivosDe). */
export const seleccionImagen = {
  id: true,
  identificador: true,
  orden: true,
  estado: true,
} as const;

/**
 * Todas las imágenes ocupan cupo, también las ocultas: el prestador puede
 * borrarlas, así que la regla queda simple (a lo más 5 filas por servicio)
 * y para subir otra en el lugar de una moderada tiene que verla y borrarla.
 */
export async function contarImagenes(servicioId: string) {
  return prisma.imagenServicio.count({ where: { servicioId } });
}

/**
 * Inserta la imagen al final de la galería si todavía hay cupo.
 *
 * El FOR UPDATE sobre el servicio serializa las subidas al mismo servicio:
 * sin él, dos subidas simultáneas con 4 imágenes contarían 4 las dos y
 * dejarían 6. Devuelve null si ya no había cupo.
 */
export async function crearImagenConCupo(servicioId: string, identificador: string, maximo: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM servicios WHERE id = ${servicioId} FOR UPDATE`;
    const actuales = await tx.imagenServicio.count({ where: { servicioId } });

    if (actuales >= maximo) return null;

    return tx.imagenServicio.create({
      data: { servicioId, identificador, orden: actuales },
      select: seleccionImagen,
    });
  });
}

export async function listarImagenesDe(servicioId: string) {
  return prisma.imagenServicio.findMany({
    where: { servicioId },
    orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
    select: seleccionImagen,
  });
}

export async function buscarImagen(id: string) {
  return prisma.imagenServicio.findUnique({ where: { id }, select: { ...seleccionImagen, servicioId: true } });
}

/** Borra la fila y renumera las que quedan (0, 1, 2…), para que el orden no tenga huecos. */
export async function eliminarImagenYCompactar(servicioId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM servicios WHERE id = ${servicioId} FOR UPDATE`;
    await tx.imagenServicio.delete({ where: { id } });
    const restantes = await tx.imagenServicio.findMany({
      where: { servicioId },
      orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
      select: { id: true },
    });
    for (const [orden, imagen] of restantes.entries()) {
      await tx.imagenServicio.update({ where: { id: imagen.id }, data: { orden } });
    }
  });
}

/** Fija el orden según la posición de cada id en la lista. */
export async function reordenarImagenes(servicioId: string, ids: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM servicios WHERE id = ${servicioId} FOR UPDATE`;
    for (const [orden, id] of ids.entries()) {
      await tx.imagenServicio.update({ where: { id, servicioId }, data: { orden } });
    }
  });
}

/** Identificadores de los archivos de un servicio, para borrarlos del proveedor junto con él. */
/** Solo las VISIBLES tienen archivo: el de una oculta se borró al moderarla. */
export async function identificadoresDeServicio(servicioId: string) {
  const filas = await prisma.imagenServicio.findMany({
    where: { servicioId, estado: "VISIBLE" },
    select: { identificador: true },
  });
  return filas.map((fila) => fila.identificador);
}

/** La moderación más reciente de cada imagen pedida, desde la bitácora. */
export async function motivosDe(imagenIds: string[]) {
  if (imagenIds.length === 0) return new Map<string, { motivo: string; creadoEn: Date; administrador: string }>();

  const registros = await prisma.moderacionImagen.findMany({
    where: { imagenId: { in: imagenIds } },
    orderBy: { creadoEn: "desc" },
    select: { imagenId: true, motivo: true, creadoEn: true, administrador: { select: { nombre: true } } },
  });

  const porImagen = new Map<string, { motivo: string; creadoEn: Date; administrador: string }>();
  for (const registro of registros) {
    if (!porImagen.has(registro.imagenId)) {
      porImagen.set(registro.imagenId, {
        motivo: registro.motivo,
        creadoEn: registro.creadoEn,
        administrador: registro.administrador.nombre,
      });
    }
  }
  return porImagen;
}

/**
 * Oculta una imagen VISIBLE, deja registro de quién, cuándo y por qué, y
 * borra su archivo del proveedor, todo o nada:
 *
 * 1. El UPDATE marca la fila y la bloquea hasta el final de la transacción
 *    (otro administrador que intente ocultarla a la vez espera y después ve
 *    que ya no está VISIBLE). Devuelve 0 si la imagen no estaba visible.
 * 2. Se registra la moderación en la bitácora (moderaciones_imagen), con el
 *    servicio, la imagen y el archivo como valores: el registro sobrevive a
 *    que el prestador borre la imagen o el servicio.
 * 3. Con todo registrado, se borra el archivo (eliminarArchivo).
 * 4. Si el proveedor falla, eliminarArchivo lanza y la transacción se
 *    revierte entera, bitácora incluida: la imagen queda VISIBLE, con su
 *    archivo y sin registro de una moderación que no ocurrió.
 *
 * El borrado del proveedor es idempotente: si se reintenta después de un
 * fallo a medias (el archivo se borró pero la respuesta no llegó), «no
 * encontrado» cuenta como éxito.
 */
export async function ocultarImagen(
  imagen: { id: string; servicioId: string; identificador: string },
  administradorId: string,
  motivo: string,
  eliminarArchivo: () => Promise<void>,
) {
  return prisma.$transaction(
    async (tx) => {
      const { count } = await tx.imagenServicio.updateMany({
        where: { id: imagen.id, estado: "VISIBLE" },
        data: { estado: "OCULTA" },
      });
      if (count === 0) return 0;

      await tx.moderacionImagen.create({
        data: {
          servicioId: imagen.servicioId,
          imagenId: imagen.id,
          identificadorArchivo: imagen.identificador,
          motivo,
          administradorId,
        },
      });
      await eliminarArchivo();
      return count;
    },
    // La llamada al proveedor cabe holgada; el valor por defecto (5 s) es justo.
    { timeout: 20_000 },
  );
}

/** Listado para moderación: las más recientes primero, con su servicio y prestador. */
export async function listarImagenesParaModerar(filtros: {
  estado?: EstadoImagen;
  servicioId?: string;
  pagina: number;
  porPagina: number;
}) {
  const where = {
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.servicioId ? { servicioId: filtros.servicioId } : {}),
  };

  const [imagenes, total] = await Promise.all([
    prisma.imagenServicio.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (filtros.pagina - 1) * filtros.porPagina,
      take: filtros.porPagina,
      select: {
        ...seleccionImagen,
        creadoEn: true,
        servicio: {
          select: { id: true, titulo: true, estado: true, prestador: { select: { usuario: { select: { nombre: true } } } } },
        },
      },
    }),
    prisma.imagenServicio.count({ where }),
  ]);

  return { imagenes, total };
}
