import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { FECHA_MINIMA_CONTRATACION, LARGO_MAXIMO_NOTAS_CONTRATACION, fechaDeHoyEnChile } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type Contratacion } from "../api/cliente";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { CampoTexto } from "./CampoTexto";
import { textoFechaCalendario } from "./fechaCalendario";

const clasesEnlace = "font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2 hover:text-noche";
const clasesAccion =
  "inline-flex min-h-11 cursor-pointer items-center rounded-boton px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario disabled:cursor-not-allowed disabled:opacity-50";

/** Editar fecha y notas de un registro, en el mismo lugar donde se lee. */
function FormularioEdicion({
  contratacion,
  cliente,
  alGuardar,
  alCancelar,
}: {
  contratacion: Contratacion;
  cliente: ClienteApi;
  alGuardar(actualizada: Contratacion): void;
  alCancelar(): void;
}) {
  const idFecha = useId();
  const idNotas = useId();
  const [fecha, setFecha] = useState(contratacion.fechaContratacion);
  const [notas, setNotas] = useState(contratacion.notas ?? "");
  const [errorFecha, setErrorFecha] = useState<string | undefined>(undefined);
  const [errorNotas, setErrorNotas] = useState<string | undefined>(undefined);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    const fechaInvalida = !fecha ? "Indica la fecha en que lo contrataste." : fecha > fechaDeHoyEnChile() ? "La fecha no puede ser futura." : undefined;
    const notasLargas =
      notas.trim().length > LARGO_MAXIMO_NOTAS_CONTRATACION ? `Las notas no pueden superar los ${LARGO_MAXIMO_NOTAS_CONTRATACION} caracteres.` : undefined;
    setErrorFecha(fechaInvalida);
    setErrorNotas(notasLargas);
    if (fechaInvalida || notasLargas) return;

    setGuardando(true);
    try {
      alGuardar(await cliente.editarContratacion(contratacion.id, { fechaContratacion: fecha, notas: notas.trim() || null }));
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("fechaContratacion")) setErrorFecha(causa.mensajeDe("fechaContratacion"));
      else if (causa instanceof ErrorApi && causa.mensajeDe("notas")) setErrorNotas(causa.mensajeDe("notas"));
      else setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={(evento) => void guardar(evento)} noValidate aria-label={`Editar ${contratacion.servicio.titulo}`} className="mt-2">
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
      <CampoAreaTexto
        id={idNotas}
        etiqueta="Notas (opcional)"
        valor={notas}
        alCambiar={(valor) => {
          setNotas(valor);
          setErrorNotas(undefined);
        }}
        minimo={0}
        maximo={LARGO_MAXIMO_NOTAS_CONTRATACION}
        error={errorNotas}
        ayuda="Por ejemplo, cuánto cobró o qué quedó pendiente. Solo tú las ves."
      />
      {errorGeneral && (
        <p role="alert" className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {errorGeneral}
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Boton type="button" variante="secundario" disabled={guardando} onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Boton>
      </div>
    </form>
  );
}

/** El enlace para valorar, o para ver la valoración que ya dejó. */
function EnlaceValoracion({ contratacion }: { contratacion: Contratacion }) {
  const { servicio, valoracion } = contratacion;
  if (!servicio.disponible || !servicio.id) {
    return valoracion ? <p className="text-sm text-texto-suave">Ya lo valoraste.</p> : null;
  }
  return (
    <Link to={`/servicios/${servicio.id}#valoraciones`} className={`text-sm ${clasesEnlace}`}>
      {valoracion ? "Ver tu valoración" : `Valorar a ${contratacion.prestador.nombre}`}
    </Link>
  );
}

function Registro({
  contratacion,
  cliente,
  alCambiar,
  alEliminar,
}: {
  contratacion: Contratacion;
  cliente: ClienteApi;
  alCambiar(actualizada: Contratacion): void;
  alEliminar(id: string): void;
}) {
  const idTitulo = useId();
  const [modo, setModo] = useState<"leer" | "editar" | "confirmarEliminar">("leer");
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { servicio } = contratacion;

  async function eliminar() {
    setError(null);
    setEliminando(true);
    try {
      await cliente.eliminarContratacion(contratacion.id);
      alEliminar(contratacion.id);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : "No fue posible eliminarlo. Intenta de nuevo.");
      setEliminando(false);
    }
  }

  return (
    <li>
      <article aria-labelledby={idTitulo} className="rounded-medio border border-borde bg-blanco p-4">
        <p className="text-sm font-bold text-primario">{textoFechaCalendario(contratacion.fechaContratacion)}</p>
        <h3 id={idTitulo} className="mt-1 font-titulos text-base font-bold break-words text-noche">
          {servicio.disponible && servicio.id ? (
            <Link to={`/servicios/${servicio.id}`} className="hover:text-primario hover:underline">
              {servicio.titulo}
            </Link>
          ) : (
            servicio.titulo
          )}
        </h3>
        <p className="mt-0.5 text-sm break-words text-texto-suave">Ofrecido por {contratacion.prestador.nombre}</p>
        {!servicio.disponible && (
          <p className="mt-2 rounded-chico bg-niebla px-3 py-2 text-sm text-noche">
            Esta publicación ya no está disponible. Guardamos el título y el nombre tal como estaban cuando lo registraste.
          </p>
        )}

        {modo === "editar" ? (
          <FormularioEdicion
            contratacion={contratacion}
            cliente={cliente}
            alGuardar={(actualizada) => {
              alCambiar(actualizada);
              setModo("leer");
            }}
            alCancelar={() => setModo("leer")}
          />
        ) : (
          <>
            {contratacion.notas && (
              <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-noche">
                <span className="font-semibold">Notas: </span>
                {contratacion.notas}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <EnlaceValoracion contratacion={contratacion} />
              <div className="ml-auto flex gap-1">
                <button type="button" onClick={() => setModo("editar")} className={`${clasesAccion} text-primario hover:bg-hielo`}>
                  Editar<span className="sr-only"> {servicio.titulo}</span>
                </button>
                <button type="button" onClick={() => setModo("confirmarEliminar")} className={`${clasesAccion} text-error-700 hover:bg-error-50`}>
                  Eliminar<span className="sr-only"> {servicio.titulo}</span>
                </button>
              </div>
            </div>
            {modo === "confirmarEliminar" && (
              <div role="group" aria-label="Confirmar eliminación" className="mt-3 rounded-medio border border-borde bg-niebla p-3">
                <p className="text-sm text-noche">¿Eliminar este registro de tu historial? No se puede deshacer.</p>
                {error && (
                  <p role="alert" className="mt-2 text-sm font-medium text-error-700">
                    {error}
                  </p>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Boton type="button" variante="secundario" disabled={eliminando} onClick={() => setModo("leer")}>
                    No, mantener
                  </Boton>
                  <Boton type="button" cargando={eliminando} onClick={() => void eliminar()}>
                    {eliminando ? "Eliminando…" : "Sí, eliminar"}
                  </Boton>
                </div>
              </div>
            )}
          </>
        )}
      </article>
    </li>
  );
}

/**
 * «Servicios contratados», en Mi perfil: el historial PRIVADO de la cuenta.
 * Solo su dueño lo ve; el prestador no sabe que existe. Ordenado por la
 * fecha en que se contrató, la más reciente primero (así lo entrega la API).
 */
export function ServiciosContratados({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [contrataciones, setContrataciones] = useState<Contratacion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    cliente
      .listarContrataciones(1)
      .then((respuesta) => {
        if (cancelado) return;
        setContrataciones(respuesta.contrataciones);
        setTotal(respuesta.total);
      })
      .catch(() => {
        if (!cancelado) setError("No fue posible cargar tus servicios contratados.");
      });
    return () => {
      cancelado = true;
    };
  }, [cliente]);

  async function verMas() {
    setCargandoMas(true);
    try {
      const respuesta = await cliente.listarContrataciones(pagina + 1);
      setContrataciones((actuales) => {
        const vistos = new Set((actuales ?? []).map((c) => c.id));
        return [...(actuales ?? []), ...respuesta.contrataciones.filter((c) => !vistos.has(c.id))];
      });
      setTotal(respuesta.total);
      setPagina(respuesta.pagina);
    } catch {
      setError("No fue posible cargar más. Intenta de nuevo.");
    } finally {
      setCargandoMas(false);
    }
  }

  // Llegando desde «quedó en tus servicios contratados» (/perfil#servicios-contratados):
  // React Router no baja solo hasta el ancla.
  const cargado = contrataciones !== null;
  useEffect(() => {
    if (cargado && window.location.hash === "#servicios-contratados") {
      document.getElementById("servicios-contratados")?.scrollIntoView?.({ block: "start" });
    }
  }, [cargado]);

  function reemplazar(actualizada: Contratacion) {
    setAviso("Guardamos los cambios.");
    // La fecha pudo cambiar: se reordena como la API (fecha descendente).
    setContrataciones((actuales) =>
      (actuales ?? [])
        .map((c) => (c.id === actualizada.id ? actualizada : c))
        .sort((a, b) => b.fechaContratacion.localeCompare(a.fechaContratacion)),
    );
  }

  function quitar(id: string) {
    setAviso("Eliminamos el registro.");
    setContrataciones((actuales) => (actuales ?? []).filter((c) => c.id !== id));
    setTotal((actual) => Math.max(0, actual - 1));
  }

  return (
    <section id="servicios-contratados" aria-labelledby={idTitulo} className="mt-6 scroll-mt-6 rounded-medio border border-borde p-4 sm:p-5">
      <h2 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        Servicios contratados
      </h2>
      <p className="mt-1 text-sm text-texto-suave">Tu historial personal. Solo tú lo ves: los prestadores no saben que los registraste.</p>

      {error && (
        <p role="alert" className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
      {!error && !contrataciones && <p className="mt-3 text-sm text-texto-suave">Cargando tu historial…</p>}

      {contrataciones && contrataciones.length === 0 && (
        <div className="mt-3 rounded-chico bg-niebla px-4 py-4 text-sm text-noche">
          <p className="font-semibold">Aún no registras servicios contratados.</p>
          <p className="mt-1">
            Cuando contrates a alguien que contactaste por LocalCL, márcalo con «Contraté este servicio» en la página de su servicio. Te sirve para
            recordar a quién llamaste, cuándo y qué te cobró, y para volver a contactarlo o valorarlo.
          </p>
          <Link to="/buscar" className={`mt-2 inline-block ${clasesEnlace}`}>
            Buscar servicios
          </Link>
        </div>
      )}

      {contrataciones && contrataciones.length > 0 && (
        <ul aria-label="Servicios contratados" className="mt-3 space-y-3">
          {contrataciones.map((contratacion) => (
            <Registro key={contratacion.id} contratacion={contratacion} cliente={cliente} alCambiar={reemplazar} alEliminar={quitar} />
          ))}
        </ul>
      )}

      {contrataciones && contrataciones.length < total && (
        <Boton type="button" variante="secundario" cargando={cargandoMas} onClick={() => void verMas()} className="mt-3">
          {cargandoMas ? "Cargando…" : "Ver más"}
        </Boton>
      )}

      <p role="status" className={aviso ? "mt-3 text-sm font-medium text-exito-700" : "sr-only"}>
        {aviso}
      </p>
    </section>
  );
}
