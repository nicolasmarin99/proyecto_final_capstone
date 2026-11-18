const formato = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" });

/**
 * «2026-11-15» → «15 de noviembre de 2026». Es un día del calendario, sin
 * hora: se lee en UTC para que la zona horaria del navegador no lo corra
 * al día anterior.
 */
export function textoFechaCalendario(fecha: string): string {
  return formato.format(new Date(`${fecha}T00:00:00Z`));
}
