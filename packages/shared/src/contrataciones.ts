/**
 * Registro PRIVADO de los servicios que un cliente contrató. Solo lo ve su
 * dueño: el prestador no sabe que existe.
 */

export const LARGO_MAXIMO_NOTAS_CONTRATACION = 500;
export const CONTRATACIONES_POR_PAGINA = 10;

/**
 * La fecha de contratación se interpreta en la hora de Chile: «hoy» es hoy
 * en Santiago, no en UTC. La base usa la misma zona en su CHECK.
 */
export const ZONA_HORARIA_CONTRATACION = "America/Santiago";

/** Antes de esto no hay contrataciones creíbles: ataja años mal tipeados (0202). */
export const FECHA_MINIMA_CONTRATACION = "2000-01-01";

/** La fecha de hoy en Chile, como «AAAA-MM-DD» (el formato de <input type="date">). */
export function fechaDeHoyEnChile(ahora: Date = new Date()): string {
  // en-CA escribe las fechas como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_CONTRATACION,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** ¿Es «AAAA-MM-DD» y una fecha que existe? (2026-02-30 no existe). */
export function esFechaCalendario(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}
