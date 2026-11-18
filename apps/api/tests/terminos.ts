import { prisma } from "../src/db.js";
import { TERMINOS_2026_11 } from "../src/maestros/terminos.js";

/**
 * Para los archivos que no cargan todos los maestros: deja publicada la
 * versión vigente, sin depender de que otro archivo la haya cargado antes.
 */
export async function asegurarTerminosVigentes(): Promise<void> {
  await prisma.versionTerminos.upsert({ where: { version: TERMINOS_2026_11.version }, create: TERMINOS_2026_11, update: {} });
}

/** La versión vigente que cargan los maestros. */
export const VERSION_TERMINOS_VIGENTE = TERMINOS_2026_11.version;

/**
 * Para los usuarios que las pruebas crean directo en la base: la cuenta nace
 * con la versión vigente aceptada, como si se hubiera registrado por la web.
 * Sin esto, autenticar() la rechaza con TERMINOS_PENDIENTES (que es lo que
 * prueba terminos.test.ts). Se usa dentro de `data` de prisma.usuario.create.
 */
export const TERMINOS_ACEPTADOS = {
  aceptacionesTerminos: { create: { version: { connect: { version: VERSION_TERMINOS_VIGENTE } } } },
};

/** Lo que el formulario de registro envía junto con los datos de la cuenta. */
export const ACEPTACION_REGISTRO = {
  aceptaTerminos: true,
  mayorDeEdad: true,
  versionTerminos: VERSION_TERMINOS_VIGENTE,
};
