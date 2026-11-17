import { z } from "zod";

/** GET /admin/extracciones/:credencialId. Sin exigir formato UUID: un id con otra forma no existe (404). */
export const esquemaIdCredencial = z.object({ credencialId: z.string().min(1).max(64) });

const CAMPOS = ["nombre", "rut", "titulo", "institucion", "fechaEmision", "fechaVencimiento"] as const;

/**
 * Lo que el administrador hizo con cada campo de la lectura automática, al
 * aprobar o rechazar: lo aceptó tal cual o lo corrigió. Solo el resultado:
 * el valor corregido no viaja ni se guarda (es evidencia de precisión, no
 * un dato de la persona).
 */
export const esquemaRevision = z
  .array(
    z.object({
      campo: z.enum(CAMPOS, { error: "Campo de lectura no válido." }),
      resultado: z.enum(["ACEPTADO", "CORREGIDO"], { error: "El resultado debe ser ACEPTADO o CORREGIDO." }),
    }),
    { error: "La revisión debe ser una lista." },
  )
  .max(CAMPOS.length, "La revisión tiene demasiados campos.")
  .optional();

export type Revision = z.infer<typeof esquemaRevision>;
