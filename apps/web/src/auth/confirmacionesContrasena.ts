import { revisarContrasena } from "@localcl/shared";

/*
  Confirmaciones en vivo para los campos de contraseña nueva. Solo dicen algo
  cuando todo está bien; los errores se siguen mostrando al enviar, porque
  marcar en rojo algo que la persona todavía está escribiendo se siente como
  un reto antes de tiempo.
*/

/** "Cumple los requisitos." cuando la contraseña pasa las reglas compartidas. */
export function confirmarReglas(
  contrasena: string,
  datos: { correo?: string; nombre?: string } = {},
): string | undefined {
  if (!contrasena || revisarContrasena(contrasena, datos)) return undefined;
  return "Cumple los requisitos.";
}

/** "Las contraseñas coinciden." cuando la repetición es idéntica y no está vacía. */
export function confirmarRepeticion(contrasena: string, repeticion: string): string | undefined {
  if (!repeticion || repeticion !== contrasena) return undefined;
  return "Las contraseñas coinciden.";
}
