/**
 * Teléfonos móviles chilenos, compartido por la API y la web para que ambas
 * acepten exactamente los mismos números.
 *
 * La forma canónica es E.164: "+569" seguido de 8 dígitos. Es la que se
 * guarda, y la que sirve para armar un enlace de WhatsApp o tel: sin
 * adivinar el código de país.
 *
 * Solo se aceptan móviles (los que empiezan con 9): el contacto con un
 * prestador es por WhatsApp o llamada al celular. La base admite cualquier
 * +56 de 9 dígitos (también fijos), así que esta regla es más estricta que
 * la del CHECK y puede relajarse sin migrar nada.
 */

/** Separadores que la gente usa al escribir un número y que se descartan. */
const SEPARADORES = /[\s().-]/g;

/**
 * Lleva cualquier escritura de un móvil chileno a "+569XXXXXXXX", o devuelve
 * null si no es uno. Acepta, por ejemplo, "9 1234 5678", "56912345678",
 * "+56 9 1234 5678" y "(+56) 9 1234-5678".
 */
export function normalizarTelefono(valor: string): string | null {
  const sinSeparadores = valor.trim().replace(SEPARADORES, "");
  const conMas = sinSeparadores.startsWith("+");
  const digitos = conMas ? sinSeparadores.slice(1) : sinSeparadores;

  // Cualquier otro carácter (letras, un segundo +) invalida la entrada: no se
  // descarta en silencio, porque "9 1234 abcd" no es un número a medio corregir.
  if (!/^\d+$/.test(digitos)) {
    return null;
  }

  // Con código de país: 56 + 9 + 8 dígitos.
  if (/^569\d{8}$/.test(digitos)) {
    return `+${digitos}`;
  }

  // Sin código de país, solo si no traía "+": "+912345678" no es chileno.
  if (!conMas && /^9\d{8}$/.test(digitos)) {
    return `+56${digitos}`;
  }

  return null;
}

/** "+56912345678" → "+56 9 1234 5678", para mostrarlo. Lo que no reconoce lo deja igual. */
export function formatearTelefono(valor: string): string {
  const coincidencia = /^\+569(\d{4})(\d{4})$/.exec(valor);

  return coincidencia ? `+56 9 ${coincidencia[1]} ${coincidencia[2]}` : valor;
}
