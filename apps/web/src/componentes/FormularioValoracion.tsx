import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { DIAS_PARA_VALORAR, LARGO_MAXIMO_COMENTARIO_VALORACION, LARGO_MINIMO_COMENTARIO_VALORACION } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type MiValoracion } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { Estrellas, SelectorEstrellas } from "./Valoraciones";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

/** Una explicación del requisito, sin decir nada de las valoraciones de otros. */
function Requisito({ children }: { children: ReactNode }) {
  return <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-noche">{children}</p>;
}

const estrellasEnTexto = (cantidad: number) => (cantidad === 1 ? "1 estrella" : `${cantidad} estrellas`);

/** La valoración ya publicada, solo para leer: es definitiva. */
function ValoracionPublicada({ calificacion, comentario, creadaEn }: { calificacion: number; comentario: string | null; creadaEn: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm">
        <Estrellas valor={calificacion} />
        <span className="font-semibold text-noche">{calificacion} de 5</span>
        <span className="sr-only">{estrellasEnTexto(calificacion)}</span>
      </p>
      {comentario && <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-noche">{comentario}</p>}
      <p className="mt-2 text-xs text-texto-suave">
        Publicada el {fecha.format(new Date(creadaEn))}. Las valoraciones son definitivas: no se pueden editar ni retirar.
      </p>
    </div>
  );
}

/**
 * Formulario para valorar a un prestador, en la página de su servicio.
 *
 * Solo un cliente con un contacto registrado en los últimos 60 días puede
 * valorar; el resto ve el requisito explicado. La API lo vuelve a revisar
 * todo: esto solo evita mostrar un formulario que sería rechazado.
 *
 * Una valoración es DEFINITIVA: antes de publicar se pide confirmar, y una
 * vez publicada solo se muestra, sin editar ni retirar (la API tampoco lo
 * permite, ni la base).
 *
 * `alCambiar` avisa que se publicó, para recargar la lista.
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
  const [publicando, setPublicando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const esCliente = usuario?.rol === "CLIENTE";

  useEffect(() => {
    if (!esCliente) return;
    let cancelado = false;
    cliente
      .miValoracion(prestadorId)
      .then((respuesta) => {
        if (cancelado) return;
        setMia(respuesta);
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, prestadorId, esCliente]);

  /** Primer paso: valida y pide confirmar, porque después no hay vuelta atrás. */
  function revisar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    const limpio = comentario.trim();
    const sinEstrellas = calificacion < 1;
    const comentarioCorto = limpio.length > 0 && limpio.length < LARGO_MINIMO_COMENTARIO_VALORACION;
    setErrorEstrellas(sinEstrellas ? "Elige de 1 a 5 estrellas." : undefined);
    setErrorComentario(
      comentarioCorto ? `Si escribes un comentario, que tenga al menos ${LARGO_MINIMO_COMENTARIO_VALORACION} caracteres.` : undefined,
    );
    if (sinEstrellas || comentarioCorto) return;
    setConfirmando(true);
  }

  async function publicar() {
    setErrorGeneral(null);
    setPublicando(true);
    try {
      const valoracion = await cliente.valorar(prestadorId, { calificacion, comentario: comentario.trim() || null });
      setAviso("¡Gracias! Tu valoración ya está publicada.");
      setMia((actual) => (actual ? { ...actual, valoracion, puedeValorar: false, motivo: "YA_VALORADA", plazoHasta: null } : actual));
      alCambiar();
    } catch (causa) {
      setConfirmando(false);
      if (causa instanceof ErrorApi && causa.mensajeDe("calificacion")) setErrorEstrellas(causa.mensajeDe("calificacion"));
      else if (causa instanceof ErrorApi && causa.mensajeDe("comentario")) setErrorComentario(causa.mensajeDe("comentario"));
      else setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
    } finally {
      setPublicando(false);
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
    if (mia.valoracion) {
      return (
        <>
          {/* Junto a la valoración recién publicada: es donde mira quien acaba de enviar. */}
          {aviso && (
            <p role="status" className="motion-safe:animate-aparecer-corto mb-3 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
              {aviso}
            </p>
          )}
          <ValoracionPublicada {...mia.valoracion} />
        </>
      );
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

    return (
      <form onSubmit={revisar} noValidate aria-labelledby={idTitulo}>
        <p className="mb-3 text-xs text-texto-suave">
          {mia.plazoHasta && `Puedes valorar hasta el ${fecha.format(new Date(mia.plazoHasta))}. `}
          Una vez publicada, tu valoración no se puede editar ni retirar.
        </p>
        <fieldset disabled={confirmando} className="min-w-0">
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
        </fieldset>

        {/* Junto a los botones: es donde mira quien acaba de enviar. */}
        {errorGeneral && (
          <p role="alert" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
            {errorGeneral}
          </p>
        )}

        {confirmando ? (
          <div role="group" aria-label="Confirmar publicación" className="mt-4 rounded-medio border border-borde bg-niebla p-3">
            <p className="text-sm text-noche">
              ¿Publicar tu valoración de {estrellasEnTexto(calificacion)}? Después no podrás editarla ni retirarla.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Boton type="button" variante="secundario" disabled={publicando} onClick={() => setConfirmando(false)}>
                Volver a revisar
              </Boton>
              <Boton type="button" cargando={publicando} onClick={() => void publicar()}>
                {publicando ? "Publicando…" : "Sí, publicar"}
              </Boton>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Boton type="submit">Publicar valoración</Boton>
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
