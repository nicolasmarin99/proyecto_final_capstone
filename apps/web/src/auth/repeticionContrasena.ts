/**
 * Comprueba que la contraseña se haya escrito dos veces igual. Devuelve el
 * mensaje de error para mostrar bajo el campo, o null si está bien.
 *
 * Vive en la web y no en @localcl/shared porque la repetición no viaja a la
 * API: solo protege a la persona de un error de tipeo al elegir la
 * contraseña, que después no podría adivinar para iniciar sesión. Al
 * servidor le llega una sola contraseña, y esa sí la valida con Zod.
 */
export function revisarRepeticion(contrasena: string, repeticion: string): string | null {
  if (!repeticion) return "Repite tu contraseña.";
  if (repeticion !== contrasena) return "Las contraseñas no coinciden.";
  return null;
}
