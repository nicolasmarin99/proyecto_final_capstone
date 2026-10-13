import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { LARGO_MAXIMO_MOTIVO_DECISION, LARGO_MINIMO_MOTIVO_DECISION, PERSONAS_PRIORIDAD_ALTA } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type DetalleReportes, type FilaColaReportes } from "../api/cliente";
import { MOTIVO_REPORTE, textoEspera } from "../servicios/reportes";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { Icono } from "./iconos";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

const NOMBRE_ACCION = { DESESTIMAR: "Desestimado", OCULTAR_SERVICIO: "Servicio ocultado" } as const;

type Accion = "desestimar" | "ocultar";

/** Una decisión con motivo obligatorio: el mismo formulario para desestimar u ocultar. */
function FormularioDecision({
  accion,
  servicioId,
  cliente,
  alDecidir,
  alCancelar,
}: {
  accion: Accion;
  servicioId: string;
  cliente: ClienteApi;
  alDecidir(detalle: DetalleReportes): void;
  alCancelar(): void;
}) {
  const idMotivo = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const limpio = motivo.trim();
    if (limpio.length < LARGO_MINIMO_MOTIVO_DECISION) {
      setError(`Explica la decisión en al menos ${LARGO_MINIMO_MOTIVO_DECISION} caracteres.`);
      return;
    }
    setEnviando(true);
    try {
      alDecidir(await cliente.decidirReportes(servicioId, accion, limpio));
    } catch (causa) {
      setError(causa instanceof ErrorApi ? (causa.mensajeDe("motivo") ?? causa.message) : "No fue posible registrar la decisión.");
      setEnviando(false);
    }
  }

  return (
    <div className={`mt-3 rounded-medio border p-3 ${accion === "ocultar" ? "border-error-700/20 bg-error-50" : "border-borde bg-niebla"}`}>
      <p className="text-sm font-semibold text-noche">
        {accion === "ocultar"
          ? "Ocultar el servicio: deja de verse en la búsqueda y en su página. El prestador verá el motivo."
          : "Desestimar: se cierran los reportes y el servicio sigue publicado."}
      </p>
      <CampoAreaTexto
        id={idMotivo}
        etiqueta={accion === "ocultar" ? "Motivo (lo verá el prestador)" : "Motivo de la decisión"}
        valor={motivo}
        alCambiar={(valor) => {
          setMotivo(valor);
          setError(undefined);
        }}
        minimo={LARGO_MINIMO_MOTIVO_DECISION}
        maximo={LARGO_MAXIMO_MOTIVO_DECISION}
        error={error}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Boton type="button" variante="secundario" disabled={enviando} onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="button" cargando={enviando} onClick={() => void confirmar()}>
          {accion === "ocultar" ? "Ocultar servicio" : "Desestimar reportes"}
        </Boton>
      </div>
    </div>
  );
}

/** El detalle de un caso: los reportes (sin quién los envió), las decisiones y las acciones. */
function DetalleCaso({
  servicioId,
  pendiente,
  cliente,
  alDecidir,
}: {
  servicioId: string;
  pendiente: boolean;
  cliente: ClienteApi;
  alDecidir(mensaje: string): void;
}) {
  const [detalle, setDetalle] = useState<DetalleReportes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);

  useEffect(() => {
    let cancelado = false;
    cliente
      .detalleReportes(servicioId)
      .then((datos) => {
        if (!cancelado) setDetalle(datos);
      })
      .catch(() => {
        if (!cancelado) setError("No fue posible cargar el detalle.");
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, servicioId]);

  if (error) return <p className="mt-3 text-sm text-error-700">{error}</p>;
  if (!detalle) return <p className="mt-3 text-sm text-texto-suave">Cargando el detalle…</p>;

  const abiertos = detalle.reportes.filter((reporte) => reporte.estado === "ABIERTA" || reporte.estado === "EN_REVISION");
  const mostrados = pendiente ? abiertos : detalle.reportes;

  return (
    <div className="mt-3 border-t border-borde pt-3">
      <p className="text-xs text-texto-suave">
        {detalle.servicio.categoria} · {detalle.servicio.prestador} ·{" "}
        <Link to={`/servicios/${detalle.servicio.id}`} className="font-semibold text-primario hover:text-noche">
          Ver la publicación
        </Link>
      </p>

      <h4 className="mt-3 text-sm font-semibold text-noche">Reportes ({mostrados.length})</h4>
      <ul className="mt-2 space-y-2">
        {mostrados.map((reporte) => (
          <li key={reporte.id} className="rounded-chico border border-borde bg-blanco p-3 text-sm">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-noche">{MOTIVO_REPORTE[reporte.motivo].texto}</span>
              <span className="text-xs text-texto-suave">{fecha.format(new Date(reporte.enviadoEn))}</span>
            </p>
            {reporte.comentario && <p className="mt-1 whitespace-pre-line text-noche">«{reporte.comentario}»</p>}
            {/* La única señal sobre quien reportó: si su cuenta era nueva. Nunca quién es. */}
            <p className={`mt-1 text-xs ${reporte.cuentaConMasDeUnaSemana ? "text-texto-suave" : "font-semibold text-alerta-700"}`}>
              {reporte.cuentaConMasDeUnaSemana ? "Cuenta con más de una semana" : "Cuenta creada hace menos de una semana"}
            </p>
          </li>
        ))}
      </ul>

      {detalle.decisiones.length > 0 && (
        <>
          <h4 className="mt-4 text-sm font-semibold text-noche">Decisiones anteriores</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {detalle.decisiones.map((decision) => (
              <li key={decision.decididaEn} className="text-texto-suave">
                <span className="font-semibold text-noche">{NOMBRE_ACCION[decision.accion]}</span> por {decision.administrador},{" "}
                {fecha.format(new Date(decision.decididaEn))}: {decision.motivo}
              </li>
            ))}
          </ul>
        </>
      )}

      {accion ? (
        <FormularioDecision
          accion={accion}
          servicioId={servicioId}
          cliente={cliente}
          alCancelar={() => setAccion(null)}
          alDecidir={(nuevo) => {
            setDetalle(nuevo);
            setAccion(null);
            alDecidir(accion === "ocultar" ? `«${nuevo.servicio.titulo}» quedó oculto.` : `Los reportes de «${nuevo.servicio.titulo}» quedaron desestimados.`);
          }}
        />
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {abiertos.length > 0 && (
            <Boton type="button" variante="secundario" onClick={() => setAccion("desestimar")}>
              Desestimar
            </Boton>
          )}
          {detalle.servicio.estado !== "OCULTO" && (
            <Boton type="button" onClick={() => setAccion("ocultar")}>
              Ocultar servicio
            </Boton>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Cola de reportes, agrupada por servicio. Los casos con
 * PERSONAS_PRIORIDAD_ALTA o más personas distintas van primero y
 * destacados; dentro de cada prioridad, el que más espera va arriba.
 *
 * Los reportes no ocultan nada por sí solos: toda decisión la toma una
 * persona desde acá, con un motivo.
 */
export function ColaReportes({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [estado, setEstado] = useState<"pendientes" | "resueltos">("pendientes");
  const [filas, setFilas] = useState<FilaColaReportes[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const datos = await cliente.colaReportes({ estado });
      setFilas(datos.servicios);
      setTotal(datos.total);
    } catch {
      setError("No fue posible cargar los reportes.");
    }
  }, [cliente, estado]);

  useEffect(() => {
    setFilas(null);
    setAbierto(null);
    void cargar();
  }, [cargar]);

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Reportes
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        Los reportes no ocultan nada por sí solos: ordenan la revisión. Con {PERSONAS_PRIORIDAD_ALTA} o más personas distintas,
        el caso pasa a prioridad alta.
      </p>

      <div role="group" aria-label="Estado de los reportes" className="mt-4 inline-flex rounded-boton border border-borde-fuerte bg-blanco p-1">
        {(["pendientes", "resueltos"] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            aria-pressed={estado === opcion}
            onClick={() => setEstado(opcion)}
            className={`min-h-10 cursor-pointer rounded-chico px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primario ${
              estado === opcion ? "bg-primario text-blanco" : "text-noche hover:bg-niebla"
            }`}
          >
            {opcion === "pendientes" ? "Pendientes" : "Resueltos"}
          </button>
        ))}
      </div>

      {/* Una sola región en vivo, siempre presente, que se ve cuando tiene algo que decir. */}
      <p role="status" className={aviso ? "mt-3 rounded-chico border border-borde bg-hielo/60 px-3 py-2 text-sm text-noche" : "sr-only"}>
        {aviso}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
      {filas === null && !error && <p className="mt-3 text-sm text-texto-suave">Cargando reportes…</p>}
      {filas?.length === 0 && (
        <p className="mt-3 text-sm text-texto-suave">{estado === "pendientes" ? "No hay reportes pendientes." : "Todavía no hay casos resueltos."}</p>
      )}

      {filas && filas.length > 0 && (
        <>
          <p className="mt-3 text-sm text-texto-suave">
            {total === 1 ? "1 servicio" : `${total} servicios`} {estado === "pendientes" ? "esperando revisión" : "con reportes resueltos"}
          </p>
          <ul className="mt-3 space-y-3">
            {filas.map((fila) => {
              const alta = estado === "pendientes" && fila.prioridad === "ALTA";
              const expandido = abierto === fila.servicio.id;
              return (
                <li key={fila.servicio.id}>
                  <article
                    aria-label={`Reportes de «${fila.servicio.titulo}»`}
                    className={`rounded-medio border p-4 ${alta ? "border-alerta-700/30 bg-alerta-50" : "border-borde bg-blanco"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-titulos text-base font-bold text-noche">{fila.servicio.titulo}</h3>
                        <p className="text-sm text-texto-suave">{fila.servicio.prestador}</p>
                      </div>
                      {alta && (
                        <span className="flex items-center gap-1 rounded-full bg-alerta-700 px-2.5 py-1 text-xs font-bold text-blanco">
                          <Icono nombre="escudo" tamano={14} grosor={2} />
                          Prioridad alta
                        </span>
                      )}
                    </div>

                    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-texto-suave">Personas distintas</dt>
                        <dd className="font-semibold text-noche">{fila.personas}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-suave">Motivo más frecuente</dt>
                        <dd className="font-semibold text-noche">{MOTIVO_REPORTE[fila.motivoFrecuente].texto}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-texto-suave">{estado === "pendientes" ? "Esperando" : "Decisión"}</dt>
                        <dd className="font-semibold text-noche">
                          {estado === "pendientes" && fila.esperaMinutos !== null
                            ? textoEspera(fila.esperaMinutos)
                            : fila.decision
                              ? NOMBRE_ACCION[fila.decision.accion]
                              : "—"}
                        </dd>
                      </div>
                    </dl>
                    {estado === "resueltos" && fila.decision && <p className="mt-2 text-sm text-texto-suave">{fila.decision.motivo}</p>}

                    <Boton
                      type="button"
                      variante="secundario"
                      className="mt-3 h-10! text-sm sm:w-auto! sm:px-5"
                      aria-expanded={expandido}
                      onClick={() => setAbierto(expandido ? null : fila.servicio.id)}
                    >
                      {expandido ? "Cerrar detalle" : estado === "pendientes" ? "Revisar" : "Ver detalle"}
                    </Boton>

                    {expandido && (
                      <DetalleCaso
                        servicioId={fila.servicio.id}
                        pendiente={estado === "pendientes"}
                        cliente={cliente}
                        alDecidir={(mensaje) => {
                          setAviso(mensaje);
                          setAbierto(null);
                          void cargar();
                        }}
                      />
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
