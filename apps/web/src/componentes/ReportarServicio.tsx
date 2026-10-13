import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  LARGO_MAXIMO_COMENTARIO_REPORTE,
  LARGO_MINIMO_COMENTARIO_OTRO,
  MOTIVOS_REPORTE,
  type MotivoReporte,
} from "@localcl/shared";
import { ErrorApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { MOTIVO_REPORTE } from "../servicios/reportes";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { Icono } from "./iconos";

type Paso =
  | { tipo: "cargando" }
  | { tipo: "formulario" }
  | { tipo: "yaReportado"; motivo: MotivoReporte }
  | { tipo: "enviado"; mensaje: string }
  | { tipo: "retirado" };

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Reporte de una publicación: un enlace discreto que abre un diálogo modal.
 *
 * - Sin sesión, invita a iniciarla y vuelve a esta página después.
 * - Con un reporte propio abierto, ofrece retirarlo en vez de repetirlo.
 * - Al enviar, agradece. Nunca dice cuántos reportes tiene el servicio.
 *
 * El diálogo atrapa el foco, se cierra con Escape y devuelve el foco al
 * enlace que lo abrió.
 *
 * Se dibuja en un portal sobre el body: la tarjeta del servicio tiene una
 * animación de entrada con transform, y un ancestro con transform convierte
 * a position: fixed en relativo a él (el fondo no cubriría el encabezado).
 */
export function ReportarServicio({ servicioId }: { servicioId: string }) {
  const { usuario, cliente } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>({ tipo: "cargando" });
  const [motivo, setMotivo] = useState<MotivoReporte | "">("");
  const [comentario, setComentario] = useState("");
  const [errores, setErrores] = useState<{
    motivo?: string;
    comentario?: string;
    general?: string;
  }>({});
  const [enviando, setEnviando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idComentario = useId();

  function cerrar() {
    setAbierto(false);
  }

  // El foco vuelve al enlace recién cuando el diálogo se cerró de verdad. Si se
  // devolviera dentro de cerrar(), una respuesta que llega justo antes de
  // cerrar (miReporte) podría volver a poner el foco dentro del diálogo, que
  // al desaparecer lo dejaría en el body.
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (estabaAbierto.current && !abierto) boton.current?.focus();
    estabaAbierto.current = abierto;
  }, [abierto]);

  // Al abrir, si hay sesión, se pregunta si ya hay un reporte propio.
  useEffect(() => {
    if (!abierto) return;
    if (!usuario) {
      setPaso({ tipo: "formulario" });
      return;
    }
    let cancelado = false;
    setPaso({ tipo: "cargando" });
    cliente
      .miReporte(servicioId)
      .then((propio) => {
        if (!cancelado)
          setPaso(
            propio
              ? { tipo: "yaReportado", motivo: propio.motivo }
              : { tipo: "formulario" },
          );
      })
      .catch(() => {
        if (!cancelado) setPaso({ tipo: "formulario" });
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, usuario, cliente, servicioId]);

  // Al abrir, el foco entra al diálogo. Solo al abrir: si se repitiera cada
  // vez que cambia el contenido, le quitaría el foco a quien está escribiendo.
  useEffect(() => {
    if (abierto) panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();
  }, [abierto]);

  // Foco atrapado y Escape, como el menú del área del prestador. Los
  // elementos se buscan al apretar la tecla, así siguen al contenido actual.
  useEffect(() => {
    if (!abierto) return;
    const enfocables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [],
      );

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cerrar();
        return;
      }
      if (evento.key !== "Tab") return;
      const lista = enfocables();
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (!primero || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const texto = comentario.trim();
    const encontrados: typeof errores = {};
    if (!motivo) encontrados.motivo = "Elige un motivo.";
    if (motivo === "OTRO" && texto.length < LARGO_MINIMO_COMENTARIO_OTRO) {
      encontrados.comentario = `Con «Otro», cuéntanos qué pasa en al menos ${LARGO_MINIMO_COMENTARIO_OTRO} caracteres.`;
    }
    setErrores(encontrados);
    if (!motivo || Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    try {
      const mensaje = await cliente.reportarServicio(servicioId, {
        motivo,
        comentario: texto || null,
      });
      setPaso({ tipo: "enviado", mensaje });
      setMotivo("");
      setComentario("");
    } catch (causa) {
      setErrores({
        comentario:
          causa instanceof ErrorApi ? causa.mensajeDe("comentario") : undefined,
        general:
          causa instanceof ErrorApi
            ? causa.message
            : "No pudimos enviar el reporte. Intenta de nuevo.",
      });
    } finally {
      setEnviando(false);
    }
  }

  async function retirar() {
    setEnviando(true);
    try {
      await cliente.retirarReporte(servicioId);
      setPaso({ tipo: "retirado" });
    } catch {
      setErrores({
        general: "No pudimos retirar el reporte. Intenta de nuevo.",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setErrores({});
          setAbierto(true);
        }}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-chico px-1 text-sm text-texto-suave underline decoration-borde-fuerte underline-offset-2 hover:text-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
      >
        <Icono nombre="escudo" tamano={16} />
        Reportar esta publicación
      </button>

      {abierto &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
            <div
              aria-hidden="true"
              onClick={cerrar}
              className="absolute inset-0 bg-noche/40"
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={idTitulo}
              className="motion-safe:animate-aparecer-corto relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-grande bg-blanco p-5 shadow-tarjeta-alta sm:rounded-grande sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={idTitulo}
                  className="font-titulos text-lg font-bold text-noche"
                >
                  Reportar esta publicación
                </h2>
                <button
                  type="button"
                  onClick={cerrar}
                  aria-label="Cerrar"
                  className="-mt-1 -mr-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-chico text-noche hover:bg-niebla focus-visible:outline-2 focus-visible:outline-primario"
                >
                  <Icono nombre="cerrar" tamano={20} />
                </button>
              </div>

              {errores.general && (
                <p
                  role="alert"
                  className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-3 py-2 text-sm text-error-700"
                >
                  {errores.general}
                </p>
              )}

              {!usuario && (
                <div className="mt-3 text-sm text-texto-suave">
                  <p>
                    Para reportar una publicación necesitas una cuenta con el
                    correo confirmado. Así evitamos reportes falsos.
                  </p>
                  <Link
                    to="/iniciar-sesion"
                    state={{ desde: `/servicios/${servicioId}` }}
                    className="mt-4 inline-flex h-12 items-center rounded-boton bg-primario px-6 font-bold text-blanco hover:bg-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
                  >
                    Iniciar sesión
                  </Link>
                </div>
              )}

              {usuario && usuario.correoVerificado === false && (
                <p className="mt-3 text-sm text-texto-suave">
                  Confirma tu correo para poder reportar. Busca el enlace que te
                  enviamos al registrarte.
                </p>
              )}

              {usuario &&
                usuario.correoVerificado !== false &&
                paso.tipo === "cargando" && (
                  <p className="mt-3 text-sm text-texto-suave">Cargando…</p>
                )}

              {usuario && paso.tipo === "yaReportado" && (
                <div className="mt-3 text-sm text-noche">
                  <p>
                    Ya reportaste esta publicación por{" "}
                    <strong>
                      {MOTIVO_REPORTE[paso.motivo].texto.toLowerCase()}
                    </strong>
                    . Un administrador la va a revisar.
                  </p>
                  <p className="mt-2 text-texto-suave">
                    Si te equivocaste, puedes retirar tu reporte.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Boton type="button" variante="secundario" onClick={cerrar}>
                      Mantener
                    </Boton>
                    <Boton
                      type="button"
                      cargando={enviando}
                      onClick={() => void retirar()}
                    >
                      Retirar mi reporte
                    </Boton>
                  </div>
                </div>
              )}

              {(paso.tipo === "enviado" || paso.tipo === "retirado") && (
                <div role="status" className="mt-3 text-sm text-noche">
                  <p className="flex items-start gap-2">
                    <Icono
                      nombre="visto"
                      tamano={18}
                      grosor={2.2}
                      className="mt-0.5 shrink-0 text-exito-700"
                    />
                    {paso.tipo === "enviado"
                      ? paso.mensaje
                      : "Retiraste tu reporte."}
                  </p>
                  {paso.tipo === "enviado" && (
                    <p className="mt-2 text-texto-suave">
                      Una persona del equipo revisa cada caso. Reportar no
                      oculta la publicación por sí solo.
                    </p>
                  )}
                  <Boton
                    type="button"
                    variante="secundario"
                    className="mt-4"
                    onClick={cerrar}
                  >
                    Cerrar
                  </Boton>
                </div>
              )}

              {usuario &&
                usuario.correoVerificado !== false &&
                paso.tipo === "formulario" && (
                  <form
                    onSubmit={(evento) => void enviar(evento)}
                    noValidate
                    className="mt-3"
                  >
                    <fieldset
                      aria-describedby={
                        errores.motivo ? `${idTitulo}-motivo` : undefined
                      }
                    >
                      <legend className="text-sm font-bold text-noche">
                        ¿Qué pasa con esta publicación?
                      </legend>
                      <div className="mt-2 space-y-1.5">
                        {MOTIVOS_REPORTE.map((opcion) => (
                          <label
                            key={opcion}
                            className={`flex cursor-pointer items-start gap-3 rounded-chico border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primario ${
                              motivo === opcion
                                ? "border-primario bg-hielo/60"
                                : "border-borde hover:bg-niebla"
                            }`}
                          >
                            <input
                              type="radio"
                              name="motivo"
                              value={opcion}
                              checked={motivo === opcion}
                              onChange={() => {
                                setMotivo(opcion);
                                setErrores({});
                              }}
                              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primario"
                            />
                            <span>
                              <span className="block font-semibold text-noche">
                                {MOTIVO_REPORTE[opcion].texto}
                              </span>
                              <span className="block text-texto-suave">
                                {MOTIVO_REPORTE[opcion].ayuda}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {errores.motivo && (
                        <p
                          id={`${idTitulo}-motivo`}
                          role="alert"
                          className="mt-2 text-sm font-medium text-error-700"
                        >
                          {errores.motivo}
                        </p>
                      )}
                    </fieldset>

                    <CampoAreaTexto
                      id={idComentario}
                      etiqueta={
                        motivo === "OTRO"
                          ? "Comentario (obligatorio)"
                          : "Comentario (opcional)"
                      }
                      valor={comentario}
                      alCambiar={(valor) => {
                        setComentario(valor);
                        setErrores((actuales) => ({
                          ...actuales,
                          comentario: undefined,
                        }));
                      }}
                      minimo={
                        motivo === "OTRO" ? LARGO_MINIMO_COMENTARIO_OTRO : 0
                      }
                      maximo={LARGO_MAXIMO_COMENTARIO_REPORTE}
                      error={errores.comentario}
                      ayuda="No incluyas datos personales. Quien publicó el servicio nunca sabrá quién lo reportó."
                    />

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <Boton
                        type="button"
                        variante="secundario"
                        onClick={cerrar}
                        disabled={enviando}
                      >
                        Cancelar
                      </Boton>
                      <Boton type="submit" cargando={enviando}>
                        Enviar reporte
                      </Boton>
                    </div>
                  </form>
                )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
