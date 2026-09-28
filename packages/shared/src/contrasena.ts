/**
 * Reglas de contraseña compartidas por la API y la web.
 *
 * Deliberadamente NO hay reglas de composición (una mayúscula, un número, un
 * símbolo). Obligan a patrones predecibles como "Contrasena1!", que un
 * diccionario prueba de inmediato, y empujan a la gente a reutilizar la misma
 * clave en todas partes. Lo que sí importa es el largo, que no contenga datos
 * de la propia persona, y que no esté en una filtración conocida; esto último
 * lo comprueba el servidor porque exige salir a internet.
 */

export const LARGO_MINIMO_CONTRASENA = 10;
export const LARGO_MAXIMO_CONTRASENA = 128;

/** Un fragmento más corto que esto es demasiado común para prohibirlo. */
const LARGO_MINIMO_FRAGMENTO = 4;

export type ProblemaContrasena =
  | "MUY_CORTA"
  | "MUY_LARGA"
  | "CONTIENE_CORREO"
  | "CONTIENE_NOMBRE";

/** Minúsculas y sin tildes, para que "Pérez" y "perez" se comparen igual. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function fragmentosDeCorreo(correo: string): string[] {
  const limpio = normalizar(correo);
  const parteLocal = limpio.split("@")[0] ?? "";

  // El dominio queda fuera a propósito: prohibir "gmail" le negaría esa
  // palabra a media plataforma sin ganar nada.
  return [limpio, parteLocal];
}

function fragmentosDeNombre(nombre: string): string[] {
  const limpio = normalizar(nombre);

  return [limpio.replace(/\s+/g, ""), ...limpio.split(/\s+/)];
}

function contieneAlguno(contrasena: string, fragmentos: string[]): boolean {
  return fragmentos.some(
    (fragmento) =>
      fragmento.length >= LARGO_MINIMO_FRAGMENTO && contrasena.includes(fragmento),
  );
}

/**
 * Devuelve el primer problema encontrado, o null si la contraseña pasa.
 *
 * Los datos de la persona son opcionales porque no siempre se conocen: al
 * restablecer por enlace no se pide el nombre.
 */
export function revisarContrasena(
  contrasena: string,
  datos: { correo?: string; nombre?: string } = {},
): ProblemaContrasena | null {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    return "MUY_CORTA";
  }

  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    return "MUY_LARGA";
  }

  const clave = normalizar(contrasena);

  if (datos.correo && contieneAlguno(clave, fragmentosDeCorreo(datos.correo))) {
    return "CONTIENE_CORREO";
  }

  if (datos.nombre && contieneAlguno(clave, fragmentosDeNombre(datos.nombre))) {
    return "CONTIENE_NOMBRE";
  }

  return null;
}

const MENSAJES: Record<ProblemaContrasena, string> = {
  MUY_CORTA: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
  MUY_LARGA: `La contraseña no puede superar los ${LARGO_MAXIMO_CONTRASENA} caracteres.`,
  CONTIENE_CORREO: "La contraseña no puede contener tu correo.",
  CONTIENE_NOMBRE: "La contraseña no puede contener tu nombre.",
};

export function mensajeDeProblema(problema: ProblemaContrasena): string {
  return MENSAJES[problema];
}

/** Mensaje de la contraseña filtrada. Lo decide el servidor, pero el texto vive acá. */
export const MENSAJE_CONTRASENA_FILTRADA =
  "Esta contraseña apareció en una filtración conocida. Elige otra.";
