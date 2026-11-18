import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { FECHA_MINIMA_CONTRATACION, fechaDeHoyEnChile } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type ContratacionesEnServicio } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "./Boton";
import { CampoTexto } from "./CampoTexto";
import { textoFechaCalendario } from "./fechaCalendario";

/**
 * «Contraté este servicio», en la página del servicio.
 *
 * Solo aparece para quien contactó a este prestador desde LocalCL (la API lo
 * decide y lo vuelve a revisar al registrar). Si no lo contactó, o el
 * servicio es suyo, no se muestra nada: no hay nada que ofrecer.
 *
 * El registro es PRIVADO: el prestador no lo ve ni recibe aviso. Se dice
 * junto al botón, porque es lo primero que alguien se preguntaría.
 *
 * `version` sube cuando el cliente acaba de contactar por WhatsApp: así el
 * control aparece sin recargar la página.
 */
export function ContratacionServicio({
  servicioId,
  nombrePrestador,
  cliente,
  version,
}: {
  servicioId: string;
  nombrePrestador: string;
  cliente: ClienteApi;
  version: number;
}) {
  const { usuario } = useAuth();
  const idTitulo = useId();
  const idFecha = useId();
  const [estado, setEstado] = useState<ContratacionesEnServicio | null>(null);
  const [fecha, setFecha] = useState(() => fechaDeHoyEnChile());
  const [errorFecha, setErrorFecha] = useState<string | undefined>(undefined);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Un administrador no lleva historial de servicios contratados.
  const puedeTenerHistorial = usuario?.rol === "CLIENTE" || usuario?.rol === "PRESTADOR";

  useEffect(() => {
    if (!puedeTenerHistorial) return;
    let cancelado = false;
    cliente
      .contratacionesEnServicio(servicioId)
      .then((respuesta) => {
        if (!cancelado) setEstado(respuesta);
      })
      .catch(() => {
        // Sin el estado no se ofrece el control: es un extra de la página, no su contenido.
        if (!cancelado) setEstado(null);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, servicioId, puedeTenerHistorial, version]);

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setRegistrado(false);
    if (!fecha) {
      setErrorFecha("Indica la fecha en que lo contrataste.");
      return;
    }
    if (fecha > fechaDeHoyEnChile()) {
      setErrorFecha("La fecha no puede ser futura.");
      return;
    }
    setErrorFecha(undefined);
    setEnviando(true);
    try {
      const nueva = await cliente.registrarContratacion({ servicioId, fechaContratacion: fecha });
      setEstado((actual) =>
        actual
          ? { ...actual, contrataciones: [nueva, ...actual.contrataciones].sort((a, b) => b.fechaContratacion.localeCompare(a.fechaContratacion)) }
          : actual,
      );
      setRegistrado(true);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("fechaContratacion")) setErrorFecha(causa.mensajeDe("fechaContratacion"));
      else setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible registrarlo. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!estado || (!estado.puedeRegistrar && estado.contrataciones.length === 0)) return null;

  return (
    <section aria-labelledby={idTitulo} className="mt-6 rounded-medio border border-borde p-4 sm:p-5">
      <h3 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        ¿Contrataste este servicio?
      </h3>
      <p className="mt-1 text-sm text-texto-suave">
        Llévalo en tu historial para recordar cuándo lo contrataste. Solo tú lo ves: {nombrePrestador} no lo ve ni recibe ningún aviso.
      </p>

      {estado.contrataciones.length > 0 && (
        <ul aria-label="Ya lo registraste" className="mt-3 space-y-1 text-sm text-noche">
          {estado.contrataciones.map((contratacion) => (
            <li key={contratacion.id}>Lo registraste como contratado el {textoFechaCalendario(contratacion.fechaContratacion)}.</li>
          ))}
        </ul>
      )}

      {estado.puedeRegistrar && (
        <form onSubmit={(evento) => void registrar(evento)} noValidate className="sm:flex sm:items-end sm:gap-3">
          <div className="sm:w-64">
            <CampoTexto
              id={idFecha}
              etiqueta="Fecha en que lo contrataste"
              tipo="date"
              autoComplete="off"
              valor={fecha}
              alCambiar={(valor) => {
                setFecha(valor);
                setErrorFecha(undefined);
              }}
              min={FECHA_MINIMA_CONTRATACION}
              max={fechaDeHoyEnChile()}
              error={errorFecha}
            />
          </div>
          <div className="mt-4 sm:mt-0 sm:w-auto">
            {/* Alineado con el campo y no con su mensaje: el mensaje va debajo de ambos. */}
            <Boton type="submit" variante="secundario" cargando={enviando} className="sm:w-auto sm:px-6">
              {enviando ? "Registrando…" : "Contraté este servicio"}
            </Boton>
          </div>
        </form>
      )}

      {errorGeneral && (
        <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {errorGeneral}
        </p>
      )}
      <p role="status" className={registrado ? "mt-3 text-sm font-medium text-exito-700" : "sr-only"}>
        {registrado && (
          <>
            Listo: quedó en tus{" "}
            <Link to="/perfil#servicios-contratados" className="underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario">
              servicios contratados
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}
