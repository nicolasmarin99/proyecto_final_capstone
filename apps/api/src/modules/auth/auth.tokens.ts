import type { CookieOptions } from "express";
import { env } from "../../env.js";
import { generarToken, hashearToken } from "../../shared/tokens.js";

export const NOMBRE_COOKIE_REFRESCO = "lc_refresh";

const DIAS_REFRESCO = 7;
export const MS_REFRESCO = DIAS_REFRESCO * 24 * 60 * 60 * 1000;

/** Ver shared/tokens.ts: misma regla que para los tokens que van por correo. */
export function generarTokenRefresco(): string {
  return generarToken();
}

export function hashearTokenRefresco(token: string): string {
  return hashearToken(token);
}

const atributosBase = {
  // El JavaScript de la página no puede leerla: reduce el daño de un XSS.
  httpOnly: true,
  // No viaja en peticiones originadas por otros sitios: mitiga CSRF.
  sameSite: "strict",
  // La web se sirve tras un proxy que antepone /api, así que un path más
  // específico no coincidiría al momento de reenviar la cookie.
  path: "/",
} as const;

export function opcionesCookieRefresco(): CookieOptions {
  return {
    ...atributosBase,
    // En desarrollo se trabaja sobre http; exigir secure impediría la sesión.
    secure: env.NODE_ENV === "production",
    maxAge: MS_REFRESCO,
  };
}

/** clearCookie solo borra si los atributos coinciden con los de emisión. */
export function opcionesLimpiezaCookie(): CookieOptions {
  return { ...atributosBase, secure: env.NODE_ENV === "production" };
}
