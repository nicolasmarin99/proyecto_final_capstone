import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { DIAS_PARA_VALORAR, LARGO_MAXIMO_COMENTARIO_VALORACION, LARGO_MINIMO_COMENTARIO_VALORACION } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type MiValoracion } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { SelectorEstrellas } from "./Valoraciones";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

/** Una explicación del requisito, sin decir nada de las valoraciones de otros. */
function Requisito({ children }: { children: ReactNode }) {
  return <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-noche">{children}</p>;
}

/**
 * Formulario para valorar a un prestador, en la página de su servicio.
 *
 * Solo un cliente con un contacto registrado en los últimos 60 días puede
 * valorar; el resto ve el requisito explicado. La API lo vuelve a revisar
 * todo: esto solo evita mostrar un formulario que sería rechazado.
 *
 * `alCambiar` avisa que se creó, editó o retiró, para recargar la lista.
 */
export function FormularioValoracion({
  prestadorId,
  nombrePrestador,
  servicioId,
  cliente,
  alCambiar,
}: {
  prestadorId: string;
  nombrePrestador: string;
  servicioId: string;
  cliente: ClienteApi;
  alCambiar(): void;
}) {
  const { usuario } = useAuth();
  const idTitulo = useId();
  const idComentario = useId();
  const idErrorEstrellas = useId();
  const [mia, setMia] = useState<MiValoracion | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [errorEstrellas, setErrorEstrellas] = useState<string | undefined>(undefined);
  const [errorComentario, setErrorComentario] = useState<string | undefined>(undefined);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"guardar" | "retirar" | null>(null);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);

  const esCliente = usuario?.rol === "CLIENTE";

  useEffect(() => {
    if (!esCliente) return;
    let cancelado = false;
    cliente
      .miValoracion(prestadorId)
      .then((respuesta) => {
        if (cancelado) return;
        setMia(respuesta);
        setCalificacion(respuesta.valoracion?.calificacion ?? 0);
        setComentario(respuesta.valoracion?.comentario ?? "");
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, prestadorId, esCliente]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setAviso(null);
    const limpio = comentario.trim();
    const sinEstrellas = calificacion < 1;
    const comentarioCorto = limpio.length > 0 && limpio.length < LARGO_MINIMO_COMENTARIO_VALORACION;
    setErrorEstrellas(sinEstrellas ? "Elige de 1 a 5 estrellas." : undefined);
    setErrorComentario(
      comentarioCorto ? `Si escribes un comentario, que tenga al menos ${LARGO_MINIMO_COMENTARIO_VALORACION} caracteres.` : undefined,
    );
    if (sinEstrellas || comentarioCorto) return;

    setOcupado("guardar");
    try {
      const valoracion = await cliente.valorar(prestadorId, { calificacion, comentario: limpio || null });
      setAviso(mia?.valoracion ? "Guardamos los cambios de tu valoración." : "¡Gracias! Tu valoración ya está publicada.");
      setMia((actual) => (actual ? { ...actual, valoracion, puedeRetirar: actual.valoracion ? actual.puedeRetirar : true } : actual));
      alCambiar();
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("calificacion")) setErrorEstrellas(causa.mensajeDe("calificacion"));
      else if (causa instanceof ErrorApi && causa.mensajeDe("comentario")) setErrorComentario(causa.mensajeDe("comentario"));
      else setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
    } finally {
      setOcupado(null);
    }
  }

  async function retirar() {
    setErrorGeneral(null);
    setAviso(null);
    setOcupado("retirar");
    try {
      await cliente.retirarValoracion(prestadorId);
      setMia((actual) => (actual ? { ...actual, valoracion: null, puedeRetirar: false } : actual));
      setCalificacion(0);
      setComentario("");
      setConfirmandoRetiro(false);
      setAviso("Retiraste tu valoración.");
      alCambiar();
    } catch (causa) {
      setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible retirar tu valoración.");
    } finally {
      setOcupado(null);
    }
  }

  function contenido() {
    if (!usuario) {
      return (
        <Requisito>
          Valoran quienes contactaron a {nombrePrestador} desde LocalCL.{" "}
          <Link
            to="/iniciar-sesion"
            state={{ desde: `/servicios/${servicioId}` }}
            className="font-semibold underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
          >
            Inicia sesión
          </Link>{" "}
          con la cuenta con que lo contactaste.
        </Requisito>
      );
    }
    if (!esCliente) {
      return <Requisito>Solo los clientes que contactaron a este prestador desde LocalCL pueden valorarlo.</Requisito>;
    }
    if (errorCarga) return <Requisito>No fue posible revisar si puedes valorar. Recarga la página para intentarlo de nuevo.</Requisito>;
    if (!mia) return <p className="text-sm text-texto-suave">Revisando si puedes valorar…</p>;

    if (mia.valoracion?.ocultaPorModeracion) {
      return <Requisito>Tu valoración fue ocultada por moderación y ya no se muestra en el perfil.</Requisito>;
    }
    if (!mia.puedeValorar) {
      return (
        <Requisito>
          {mia.motivo === "PLAZO_VENCIDO"
            ? `Se puede valorar dentro de los ${DIAS_PARA_VALORAR} días desde que contactas a un prestador, y ese plazo ya terminó.`
            : `Para valorar a ${nombrePrestador}, primero contáctalo desde uno de sus servicios: solo valoran quienes lo contactaron por LocalCL.`}
        </Requisito>
      );
    }

    const editando = mia.valoracion !== null;
    return (
      <form onSubmit={guardar} noValidate aria-labelledby={idTitulo}>
        {mia.plazoHasta && (
          <p className="mb-3 text-xs text-texto-suave">Puedes valorar o editar hasta el {fecha.format(new Date(mia.plazoHasta))}.</p>
        )}
        <SelectorEstrellas
          valor={calificacion}
          alCambiar={(valor) => {
            setCalificacion(valor);
            setErrorEstrellas(undefined);
          }}
          error={errorEstrellas}
          idError={idErrorEstrellas}
        />
        <CampoAreaTexto
          id={idComentario}
          etiqueta="Comentario (opcional)"
          valor={comentario}
          alCambiar={(valor) => {
            setComentario(valor);
            setErrorComentario(undefined);
          }}
          minimo={LARGO_MINIMO_COMENTARIO_VALORACION}
          maximo={LARGO_MAXIMO_COMENTARIO_VALORACION}
          error={errorComentario}
          ayuda="Cuenta cómo fue el trabajo. Se publica con tu nombre de pila."
        />

        {/* Junto a los botones: es donde mira quien acaba de enviar. */}
        {aviso && (
          <p role="status" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
            {aviso}
          </p>
        )}
        {errorGeneral && (
          <p role="alert" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
            {errorGeneral}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Boton type="submit" cargando={ocupado === "guardar"} disabled={ocupado !== null}>
            {ocupado === "guardar" ? "Guardando…" : editando ? "Guardar cambios" : "Publicar valoración"}
          </Boton>
          {editando && mia.puedeRetirar && !confirmandoRetiro && (
            <Boton type="button" variante="secundario" disabled={ocupado !== null} onClick={() => setConfirmandoRetiro(true)}>
              Retirar mi valoración
            </Boton>
          )}
        </div>
        {confirmandoRetiro && (
          <div className="mt-3 rounded-medio border border-borde bg-niebla p-3">
            <p className="text-sm text-noche">¿Retirar tu valoración? Se borra y deja de contar en el promedio.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Boton type="button" variante="secundario" disabled={ocupado !== null} onClick={() => setConfirmandoRetiro(false)}>
                Cancelar
              </Boton>
              <Boton type="button" cargando={ocupado === "retirar"} disabled={ocupado !== null} onClick={() => void retirar()}>
                Sí, retirarla
              </Boton>
            </div>
          </div>
        )}
      </form>
    );
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-6 rounded-medio border border-borde p-4 sm:p-5">
      <h3 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        {mia?.valoracion && !mia.valoracion.ocultaPorModeracion ? "Tu valoración" : `Valorar a ${nombrePrestador}`}
      </h3>
      <div className="mt-3">{contenido()}</div>
    </section>
  );
}
