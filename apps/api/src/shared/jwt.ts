import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { Rol } from "../generated/prisma/client.js";

/**
 * Vida corta a propósito. El token de acceso no se puede revocar: una vez
 * firmado vale hasta que vence. Quince minutos acotan el daño de un token
 * robado y la continuidad la da el refresco rotativo, que sí es revocable.
 */
const SEGUNDOS_ACCESO = 15 * 60;

const ALGORITMO = "HS256";

/**
 * La carga útil se valida aunque venga de un token que firmamos nosotros.
 * Además de comprobar la forma, evita arrastrar los `any` que JwtPayload
 * expone a través de su índice de claves.
 */
const esquemaCargaUtil = z.object({
  sub: z.string().min(1),
  rol: z.enum(Rol),
});

export type CargaUtilAcceso = z.infer<typeof esquemaCargaUtil>;

/** Solo sub y rol: un JWT va firmado, no cifrado, y cualquiera puede leerlo. */
export function firmarAccessToken(carga: CargaUtilAcceso): string {
  return jwt.sign(carga, env.JWT_SECRET, {
    algorithm: ALGORITMO,
    expiresIn: SEGUNDOS_ACCESO,
  });
}

/** Lanza si la firma, el algoritmo, la vigencia o la forma no cuadran. */
export function verificarAccessToken(token: string): CargaUtilAcceso {
  // La lista explícita de algoritmos es lo que cierra el ataque clásico de
  // enviar un token con alg "none", y también la confusión de algoritmos
  // (presentar como HMAC un token que se espera asimétrico).
  const cargaUtil = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITMO] });

  return esquemaCargaUtil.parse(cargaUtil);
}
