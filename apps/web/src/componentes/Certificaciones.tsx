import type { CertificacionPublica, CursoPublico } from "../api/cliente";
import { Icono } from "./iconos";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });
// Vigencia y término son días del calendario (AAAA-MM-DD a medianoche UTC): se
// formatea en UTC para que en Chile no se lea como el día anterior.
const fechaVigencia = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" });

export function formatearDia(dia: string): string {
  return fechaVigencia.format(new Date(dia));
}

/**
 * Sello «Prestador con certificaciones». Lo comparten la tarjeta del
 * buscador, la página del servicio y el perfil del prestador: la regla que
 * lo enciende es una sola, en la API (certificaciones.publicas.ts).
 */
export function SelloCertificaciones({ tamano = "chico" }: { tamano?: "chico" | "normal" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-exito-50 font-semibold text-exito-700 ${
        tamano === "chico" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      <Icono nombre="escudo" tamano={tamano === "chico" ? 14 : 16} grosor={2} />
      Prestador con certificaciones
    </span>
  );
}

/**
 * Las certificaciones aprobadas y vigentes de un prestador: nombre, quién la
 * emite, cuándo se verificó y hasta cuándo vale. Nunca el documento ni su
 * número: la API no los envía.
 */
export function ListaCertificaciones({ certificaciones }: { certificaciones: CertificacionPublica[] }) {
  return (
    <ul aria-label="Certificaciones" className="mt-3 space-y-3">
      {certificaciones.map((certificacion) => {
        const oficial = certificacion.acreditacion === "REGISTRO_OFICIAL";
        return (
          <li
            key={`${certificacion.nombre}-${certificacion.verificadaEn ?? ""}`}
            className="flex gap-3 rounded-medio border border-borde bg-blanco p-4"
          >
            <span
              aria-hidden="true"
              className={`flex size-9 shrink-0 items-center justify-center rounded-chico ${
                oficial ? "bg-primario text-blanco" : "bg-hielo text-primario"
              }`}
            >
              <Icono nombre="escudo" tamano={20} grosor={2} />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold break-words text-noche">{certificacion.nombre}</span>
              <span className="block break-words text-texto-suave">{certificacion.emisor}</span>
              {/* La distinción va en texto, no solo en el color del ícono. */}
              <span className={`mt-1 block font-medium ${oficial ? "text-primario" : "text-texto-suave"}`}>
                {oficial ? "Acreditada con el registro oficial del organismo" : "Documento revisado y aprobado por LocalCL"}
                {certificacion.verificadaEn ? ` · ${fecha.format(new Date(certificacion.verificadaEn))}` : ""}
              </span>
              <span className="mt-0.5 block text-texto-suave">
                {certificacion.vigenteHasta ? `Vigente hasta el ${formatearDia(certificacion.vigenteHasta)}` : "Sin fecha de vencimiento"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Los cursos aprobados de un prestador: nombre, institución, cuándo lo
 * terminó y cuántas horas duró. Van aparte de las certificaciones y no
 * encienden el sello. Nunca el documento ni el folio.
 */
export function ListaCursos({ cursos }: { cursos: CursoPublico[] }) {
  return (
    <ul aria-label="Cursos" className="mt-3 space-y-3">
      {cursos.map((curso) => (
        <li key={`${curso.nombre}-${curso.fechaTermino ?? ""}`} className="flex gap-3 rounded-medio border border-borde bg-blanco p-4">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-chico bg-hielo text-primario">
            <Icono nombre="llave" tamano={20} grosor={2} />
          </span>
          <span className="min-w-0 text-sm">
            <span className="block font-semibold break-words text-noche">{curso.nombre}</span>
            <span className="block break-words text-texto-suave">{curso.institucion}</span>
            <span className="mt-1 block text-texto-suave">
              {curso.fechaTermino ? `Terminado el ${formatearDia(curso.fechaTermino)}` : "Terminado"}
              {curso.horas ? ` · ${curso.horas} ${curso.horas === 1 ? "hora" : "horas"}` : ""}
            </span>
            <span className="mt-0.5 block font-medium text-texto-suave">Documento revisado y aprobado por LocalCL</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
