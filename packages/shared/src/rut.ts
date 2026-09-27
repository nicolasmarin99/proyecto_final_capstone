/**
 * Utilidades de RUT chileno, compartidas por la API y la web para que ambas
 * apliquen exactamente la misma regla y no se vayan separando con el tiempo.
 */

// Los RUT en circulación tienen 7 u 8 dígitos de cuerpo. Acotarlo descarta
// entradas como "1-9", que pasan el módulo 11 pero no son un RUT real.
const LARGO_MINIMO_CUERPO = 7;
const LARGO_MAXIMO_CUERPO = 8;

/** Deja solo dígitos y la K, en mayúscula: descarta puntos, guiones y espacios. */
function limpiar(valor: string): string {
  return valor.replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * Lleva cualquier escritura de un RUT a la forma canónica "12345678-9":
 * sin puntos, con guion, K en mayúscula y sin ceros a la izquierda.
 *
 * Devuelve "" cuando la entrada no alcanza a tener cuerpo y dígito
 * verificador. No valida: de eso se encarga esRutValido.
 */
export function normalizarRut(valor: string): string {
  const limpio = limpiar(valor);

  if (limpio.length < 2) {
    return "";
  }

  const digitoVerificador = limpio.slice(-1);
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, "");

  if (cuerpo.length === 0) {
    return "";
  }

  return `${cuerpo}-${digitoVerificador}`;
}

/**
 * Dígito verificador según módulo 11: se recorre el cuerpo de derecha a
 * izquierda multiplicando por la serie 2,3,4,5,6,7 que vuelve a empezar.
 */
function calcularDigitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;

  for (const digito of [...cuerpo].reverse()) {
    suma += Number(digito) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);

  if (resto === 11) {
    return "0";
  }

  if (resto === 10) {
    return "K";
  }

  return String(resto);
}

/** Acepta el RUT escrito de cualquier forma: normaliza antes de comprobar. */
export function esRutValido(valor: string): boolean {
  const normalizado = normalizarRut(valor);

  if (normalizado === "") {
    return false;
  }

  const [cuerpo, digitoVerificador] = normalizado.split("-");

  if (!cuerpo || !digitoVerificador) {
    return false;
  }

  // La K solo puede estar en el dígito verificador, nunca dentro del cuerpo.
  if (!/^[0-9]+$/.test(cuerpo)) {
    return false;
  }

  if (cuerpo.length < LARGO_MINIMO_CUERPO || cuerpo.length > LARGO_MAXIMO_CUERPO) {
    return false;
  }

  return calcularDigitoVerificador(cuerpo) === digitoVerificador;
}
