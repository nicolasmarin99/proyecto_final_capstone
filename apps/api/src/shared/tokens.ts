import { createHash, randomBytes } from "node:crypto";

/**
 * Token opaco para enlaces y cookies: 32 bytes del generador criptográfico,
 * o sea 256 bits. base64url para que viaje en una URL sin escapar nada.
 */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash con el que se guarda un token en la base, nunca el token mismo: quien
 * lograra leer la tabla no obtendría nada utilizable.
 *
 * SHA-256 y no Argon2 porque el valor ya es aleatorio de 256 bits y no hay
 * diccionario que probar, porque la búsqueda tiene que ser determinista para
 * poder indexarla, y porque se verifica en cada canje: hacerlo lento sería un
 * vector de denegación de servicio.
 */
export function hashearToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
