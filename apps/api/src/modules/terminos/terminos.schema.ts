import { z } from "zod";

/** El identificador de una versión de los términos, p. ej. «2026-11». */
export const campoVersionTerminos = z
  .string({ error: "Indica la versión de los términos que leíste." })
  .trim()
  .min(1, "Indica la versión de los términos que leíste.")
  .max(32, "La versión de los términos no es válida.");

/**
 * Las casillas del registro. z.literal(true): solo vale una aceptación
 * expresa; ausente, false o "true" como texto no cuentan.
 */
export const camposAceptacion = {
  aceptaTerminos: z.literal(true, { error: "Debes aceptar los términos y condiciones y la política de privacidad." }),
  mayorDeEdad: z.literal(true, { error: "Debes ser mayor de 18 años para crear una cuenta." }),
  versionTerminos: campoVersionTerminos,
};

/** POST /terminos/aceptar — { aceptaTerminos: true, versionTerminos } */
export const esquemaAceptarTerminos = z.object({
  aceptaTerminos: camposAceptacion.aceptaTerminos,
  versionTerminos: campoVersionTerminos,
});
