import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import {
  LARGO_MAXIMO_COMENTARIO_REPORTE,
  LARGO_MINIMO_COMENTARIO_OTRO,
  MOTIVOS_REPORTE_FOTO,
  type MotivoReporteFoto,
} from "@localcl/shared";
import { ErrorApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { MOTIVO_REPORTE_FOTO } from "../servicios/reportes";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { Icono } from "./iconos";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Reporte de la foto de perfil de otra cuenta: un enlace discreto que abre
 * un diálogo modal, como el reporte de una publicación.
 *
 * - Sin sesión, invita a iniciarla y vuelve a esta página después.
 * - La propia foto no se ofrece reportar (la API igual lo rechaza).
 * - Al enviar, agradece. Nunca dice cuántos reportes tiene la foto, y
 *   reportar no la quita: decide una persona del equipo.
 *
 * Se dibuja en un portal sobre el body, por la misma razón que el reporte
 * de una publicación: un ancestro con transform rompería position: fixed.
 */
export function ReportarFoto({ fotoId, nombre }: { fotoId: string; nombre: string }) {
  const { usuario, cliente, foto: miFoto } = useAuth();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoReporteFoto | "">("");
  const [comentario, setComentario] = useState("");
  const [errores, setErrores] = useState<{ motivo?: string; comentario?: string; general?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idComentario = useId();

  // El foco vuelve al enlace cuando el diálogo se cerró de verdad.
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (estabaAbierto.current && !abierto) boton.current?.focus();
    estabaAbierto.current = abierto;
  }, [abierto]);

  useEffect(() => {
    if (abierto) panel.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();
  }, [abierto]);

  // Foco atrapado y Escape.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setAbierto(false);
        return;
      }
      if (evento.key !== "Tab") return;
      const lista = Array.from(panel.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? []);
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

  // La propia foto no se reporta.
  if (miFoto?.id === fotoId) return null;

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
      setEnviado(await cliente.reportarFotoPerfil(fotoId, { motivo, comentario: texto || null }));
      setMotivo("");
      setComentario("");
    } catch (causa) {
      setErrores({
        comentario: causa instanceof ErrorApi ? causa.mensajeDe("comentario") : undefined,
        general: causa instanceof ErrorApi ? causa.message : "No pudimos enviar el reporte. Intenta de nuevo.",
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
        aria-label={`Reportar la foto de ${nombre}`}
        onClick={() => {
          setErrores({});
          setEnviado(null);
          setAbierto(true);
        }}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-chico px-1 text-xs text-texto-suave underline decoration-borde-fuerte underline-offset-2 hover:text-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
      >
        <Icono nombre="escudo" tamano={14} />
        Reportar foto
      </button>

      {abierto &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
            <div aria-hidden="true" onClick={() => setAbierto(false)} className="absolute inset-0 bg-noche/40" />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={idTitulo}
              className="motion-safe:animate-aparecer-corto relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-grande bg-blanco p-5 shadow-tarjeta-alta sm:rounded-grande sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
                  Reportar la foto de {nombre}
                </h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="-mt-1 -mr-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-chico text-noche hover:bg-niebla focus-visible:outline-2 focus-visible:outline-primario"
                >
                  <Icono nombre="cerrar" tamano={20} />
                </button>
              </div>

              {errores.general && (
                <p role="alert" className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-3 py-2 text-sm text-error-700">
                  {errores.general}
                </p>
              )}

              {!usuario && (
                <div className="mt-3 text-sm text-texto-suave">
                  <p>Para reportar una foto necesitas una cuenta con el correo confirmado. Así evitamos reportes falsos.</p>
                  <Link
                    to="/iniciar-sesion"
                    state={{ desde: pathname }}
                    className="mt-4 inline-flex h-12 items-center rounded-boton bg-primario px-6 font-bold text-blanco hover:bg-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
                  >
                    Iniciar sesión
                  </Link>
                </div>
              )}

              {usuario && usuario.correoVerificado === false && (
                <p className="mt-3 text-sm text-texto-suave">Confirma tu correo para poder reportar. Busca el enlace que te enviamos al registrarte.</p>
              )}

              {enviado !== null && (
                <div role="status" className="mt-3 text-sm text-noche">
                  <p className="flex items-start gap-2">
                    <Icono nombre="visto" tamano={18} grosor={2.2} className="mt-0.5 shrink-0 text-exito-700" />
                    {enviado}
                  </p>
                  <p className="mt-2 text-texto-suave">Una persona del equipo revisa cada caso. Reportar no quita la foto por sí solo.</p>
                  <Boton type="button" variante="secundario" className="mt-4" onClick={() => setAbierto(false)}>
                    Cerrar
                  </Boton>
                </div>
              )}

              {usuario && usuario.correoVerificado !== false && enviado === null && (
                <form onSubmit={(evento) => void enviar(evento)} noValidate className="mt-3">
                  <fieldset aria-describedby={errores.motivo ? `${idTitulo}-motivo` : undefined}>
                    <legend className="text-sm font-bold text-noche">¿Qué pasa con esta foto?</legend>
                    <div className="mt-2 space-y-1.5">
                      {MOTIVOS_REPORTE_FOTO.map((opcion) => (
                        <label
                          key={opcion}
                          className={`flex cursor-pointer items-start gap-3 rounded-chico border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primario ${
                            motivo === opcion ? "border-primario bg-hielo/60" : "border-borde hover:bg-niebla"
                          }`}
                        >
                          <input
                            type="radio"
                            name="motivo-foto"
                            value={opcion}
                            checked={motivo === opcion}
                            onChange={() => {
                              setMotivo(opcion);
                              setErrores({});
                            }}
                            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primario"
                          />
                          <span>
                            <span className="block font-semibold text-noche">{MOTIVO_REPORTE_FOTO[opcion].texto}</span>
                            <span className="block text-texto-suave">{MOTIVO_REPORTE_FOTO[opcion].ayuda}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {errores.motivo && (
                      <p id={`${idTitulo}-motivo`} role="alert" className="mt-2 text-sm font-medium text-error-700">
                        {errores.motivo}
                      </p>
                    )}
                  </fieldset>

                  <CampoAreaTexto
                    id={idComentario}
                    etiqueta={motivo === "OTRO" ? "Comentario (obligatorio)" : "Comentario (opcional)"}
                    valor={comentario}
                    alCambiar={(valor) => {
                      setComentario(valor);
                      setErrores((actuales) => ({ ...actuales, comentario: undefined }));
                    }}
                    minimo={motivo === "OTRO" ? LARGO_MINIMO_COMENTARIO_OTRO : 0}
                    maximo={LARGO_MAXIMO_COMENTARIO_REPORTE}
                    error={errores.comentario}
                    ayuda="No incluyas datos personales. La persona nunca sabrá quién reportó su foto."
                  />

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <Boton type="button" variante="secundario" onClick={() => setAbierto(false)} disabled={enviando}>
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
