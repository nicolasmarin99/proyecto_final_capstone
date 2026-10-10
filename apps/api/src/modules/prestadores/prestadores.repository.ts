import { prisma } from "../../db.js";
import { seleccionComuna } from "../territorio/territorio.repository.js";
import type { DatosPerfilPrestador } from "./prestadores.schema.js";

/**
 * Lo que se devuelve del perfil. La ubicación no aparece: es una columna
 * geography que Prisma no puede leer, y todavía no se pide. Cuando llegue la
 * geocodificación se leerá con $queryRaw.
 */
const seleccionPerfil = {
  id: true,
  descripcion: true,
  telefono: true,
  radioAtencionKm: true,
  comuna: { select: seleccionComuna },
  creadoEn: true,
  actualizadoEn: true,
} as const;

export async function buscarPerfilPorUsuario(usuarioId: string) {
  return prisma.perfilPrestador.findUnique({ where: { usuarioId }, select: seleccionPerfil });
}

export async function existePerfil(usuarioId: string): Promise<boolean> {
  return (await prisma.perfilPrestador.count({ where: { usuarioId } })) > 0;
}

/**
 * Crea o actualiza el perfil del usuario. Se busca por usuarioId, que es
 * UNIQUE en la base: un prestador nunca puede quedar con dos perfiles.
 *
 * El update enumera los campos que cambia en vez de pasar el objeto entero:
 * así la ubicación, que no está entre ellos, sobrevive a cada edición.
 */
export async function guardarPerfil(usuarioId: string, datos: DatosPerfilPrestador) {
  const campos = {
    descripcion: datos.descripcion,
    telefono: datos.telefono,
    comunaId: datos.comunaId,
    radioAtencionKm: datos.radioAtencionKm,
  };

  return prisma.perfilPrestador.upsert({
    where: { usuarioId },
    create: { usuarioId, ...campos },
    update: campos,
    select: seleccionPerfil,
  });
}
