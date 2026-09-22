import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import { env } from "../../env.js";

export const NOMBRE_COOKIE_REFRESCO = "lc_refresh";

const DIAS_REFRESCO = 7;
export const MS_REFRESCO = DIAS_REFRESCO * 24 * 60 * 60 * 1000;

/** 32 bytes del generador criptográfico: 256 bits, no se adivina por fuerza bruta. */
export function generarTokenRefresco(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * En la base solo se guarda el SHA-256 del token, nunca el token mismo: quien
 * lograra leer la tabla de sesiones no obtendría nada utilizable.
 *
 * Alcanza con SHA-256 y no hace falta Argon2 porque el valor ya es aleatorio
 * de 256 bits (no hay diccionario que probar) y porque la búsqueda por hash
 * tiene que ser determinista para poder indexarla.
 */
export function hashearTokenRefresco(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
