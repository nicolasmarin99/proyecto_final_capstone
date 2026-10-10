import {
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MINIMO_DESCRIPCION,
  normalizarTelefono,
  RADIO_MAXIMO_KM,
  RADIO_MINIMO_KM,
} from "@localcl/shared";
import { z } from "zod";

/**
 * Datos que acepta PUT /prestadores/yo.
 *
 * No declara usuarioId ni ubicacion a propósito: Zod descarta las claves que
 * no están declaradas, así que nadie puede escribir el perfil de otro ni
 * inventarse una ubicación enviándola en el cuerpo. El dueño lo fija el
 * servidor con el token; la ubicación llegará por geocodificación.
 *
 * Los límites vienen de @localcl/shared: la web muestra los mismos números.
 */
export const esquemaPerfilPrestador = z.object({
  descripcion: z
    .string({ error: "La descripción es obligatoria." })
    .trim()
    .min(
      LARGO_MINIMO_DESCRIPCION,
      `La descripción debe tener al menos ${LARGO_MINIMO_DESCRIPCION} caracteres.`,
    )
    .max(
      LARGO_MAXIMO_DESCRIPCION,
      `La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION} caracteres.`,
    ),
  telefono: z
    .string({ error: "El teléfono es obligatorio." })
    // transform + refine en un solo paso: se normaliza una vez y, si no se
    // pudo, el error queda colgado del campo para que la web lo muestre ahí.
    .transform((valor, contexto) => {
      const normalizado = normalizarTelefono(valor);

      if (!normalizado) {
        contexto.addIssue({
          code: "custom",
          message: "Ingresa un celular chileno, por ejemplo 9 1234 5678.",
        });
        return z.NEVER;
      }

      return normalizado;
    }),
  comunaId: z
    .number({ error: "Selecciona una comuna." })
    .int("Selecciona una comuna.")
    .positive("Selecciona una comuna."),
  radioAtencionKm: z
    .number({ error: "Indica hasta cuántos kilómetros atiendes." })
    .int("El radio debe ser un número entero de kilómetros.")
    .min(RADIO_MINIMO_KM, `El radio debe ser de al menos ${RADIO_MINIMO_KM} km.`)
    .max(RADIO_MAXIMO_KM, `El radio no puede superar los ${RADIO_MAXIMO_KM} km.`),
});

export type DatosPerfilPrestador = z.infer<typeof esquemaPerfilPrestador>;
