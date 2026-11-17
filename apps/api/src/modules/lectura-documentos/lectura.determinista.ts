import { createHash } from "node:crypto";
import { soloCamposPermitidos, type CampoExtraido, type DocumentoALeer, type LectorDocumentos, type TipoDocumentoLectura } from "./lectura.tipos.js";

/*
  Lector determinista: no sale a la red. Es el de las pruebas (ninguna envía
  un documento a Google) y el del desarrollo sin clave.

  No lee de verdad. Devuelve:
  - lo que una prueba programó para ese documento exacto (programar()), o
  - campos de ejemplo derivados del hash del contenido: el mismo documento
    da siempre lo mismo, en cualquier máquina.

  Lo que devuelve pasa por el mismo filtro que el lector real
  (soloCamposPermitidos): si una prueba programa un domicilio para una
  cédula, se descarta igual.
*/

/** Dígito verificador de un RUT (módulo 11). */
function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const digito of String(cuerpo).split("").reverse()) {
    suma += Number(digito) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

const NOMBRES = ["Camila", "Matías", "Fernanda", "Diego", "Javiera", "Tomás"];
const APELLIDOS = ["Soto", "Muñoz", "Rojas", "Díaz", "Contreras", "Fuentes"];

export class LectorDeterminista implements LectorDocumentos {
  readonly modelo = "determinista-v1";
  private readonly programadas = new Map<string, unknown[]>();

  private static huella(contenido: Buffer): string {
    return createHash("sha256").update(contenido).digest("hex");
  }

  /**
   * Para las pruebas: lo que «leerá» de ese documento exacto. Acepta
   * cualquier campo a propósito, también los no permitidos: así se prueba
   * que el filtro los descarta.
   */
  programar(contenido: Buffer, campos: { campo: string; valor: string; confianza: number }[]): void {
    this.programadas.set(LectorDeterminista.huella(contenido), campos);
  }

  /** Para las pruebas: olvida lo programado. */
  reiniciar(): void {
    this.programadas.clear();
  }

  async leer(documento: DocumentoALeer, tipo: TipoDocumentoLectura): Promise<CampoExtraido[]> {
    const huella = LectorDeterminista.huella(documento.contenido);
    const programado = this.programadas.get(huella);
    if (programado) return soloCamposPermitidos(tipo, programado);

    // Campos de ejemplo, fijos para ese contenido.
    const numero = Number.parseInt(huella.slice(0, 8), 16);
    const cuerpo = 10_000_000 + (numero % 15_000_000);
    const nombre = `${NOMBRES[numero % NOMBRES.length]} ${APELLIDOS[(numero >>> 4) % APELLIDOS.length]} (ejemplo)`;
    const ejemplo = [
      { campo: "nombre", valor: nombre, confianza: 0.9 },
      { campo: "rut", valor: `${cuerpo}-${digitoVerificador(cuerpo)}`, confianza: 0.85 },
      { campo: "titulo", valor: "Documento de ejemplo (lector determinista)", confianza: 0.6 },
      { campo: "institucion", valor: "Institución de ejemplo", confianza: 0.55 },
      { campo: "fechaEmision", valor: "2025-03-15", confianza: 0.8 },
    ];
    return soloCamposPermitidos(tipo, ejemplo);
  }
}
