import type { PrismaClient } from "../generated/prisma/client.js";
import { CATEGORIAS, COMUNAS, REGIONES, TERMINOS_INICIALES, TIPOS_CREDENCIAL } from "./datos.js";

export interface ResumenMaestros {
  regiones: number;
  comunas: number;
  categorias: number;
  tiposCredencial: number;
  versionesTerminos: number;
}

/**
 * Carga los datos maestros. Es idempotente: cada fila se busca por su clave
 * natural (código CUT, slug, código, versión) y se crea o se actualiza, así
 * que correrlo dos veces deja la base igual que correrlo una.
 *
 * Qué se actualiza y qué no:
 * - Nombres y orden se sincronizan con este código.
 * - "activa" / "activo" no se tocan al actualizar: los decide un
 *   administrador, y volver a correr el seed no debe deshacer esa decisión.
 * - Una versión de términos ya publicada no se modifica nunca (update vacío):
 *   es lo que alguien aceptó.
 *
 * Todo va en una transacción: si algo falla, no queda una carga a medias.
 * El límite de tiempo se sube de los 5 s por defecto a 2 min: son unos 370
 * upserts uno tras otro, y contra una base remota (Neon) cada uno paga un
 * viaje de red.
 */
export async function cargarMaestros(prisma: PrismaClient): Promise<ResumenMaestros> {
  return prisma.$transaction(async (tx) => {
    for (const { id, nombre, orden } of REGIONES) {
      await tx.region.upsert({ where: { id }, create: { id, nombre, orden }, update: { nombre, orden } });
    }

    for (const { id, nombre, regionId } of COMUNAS) {
      await tx.comuna.upsert({ where: { id }, create: { id, nombre, regionId }, update: { nombre, regionId } });
    }

    for (const { slug, nombre, orden } of CATEGORIAS) {
      await tx.categoria.upsert({ where: { slug }, create: { slug, nombre, orden }, update: { nombre, orden } });
    }

    for (const { codigo, ...resto } of TIPOS_CREDENCIAL) {
      await tx.tipoCredencial.upsert({ where: { codigo }, create: { codigo, ...resto }, update: resto });
    }

    await tx.versionTerminos.upsert({
      where: { version: TERMINOS_INICIALES.version },
      create: TERMINOS_INICIALES,
      update: {},
    });

    return {
      regiones: REGIONES.length,
      comunas: COMUNAS.length,
      categorias: CATEGORIAS.length,
      tiposCredencial: TIPOS_CREDENCIAL.length,
      versionesTerminos: 1,
    };
  }, { timeout: 120_000, maxWait: 10_000 });
}
