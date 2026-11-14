import { useCallback, useEffect, useId, useState } from "react";
import { LARGO_MAXIMO_COMENTARIO_OBJECION, LARGO_MINIMO_COMENTARIO_OBJECION, MOTIVOS_OBJECION, type MotivoObjecion } from "@localcl/shared";
import { ErrorApi, type PaginaRecibidas, type ValoracionRecibida } from "../../api/cliente";
import { useAuth } from "../../auth/ContextoAuth";
import { CompletarPerfilPrimero, SeccionArea } from "../../componentes/AreaPrestador";
import { Boton } from "../../componentes/Boton";
import { CampoAreaTexto } from "../../componentes/CampoAreaTexto";
import { Icono } from "../../componentes/iconos";
import { Distribucion, Estrellas } from "../../componentes/Valoraciones";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";
import { MOTIVO_OBJECION, textoCantidad } from "../../servicios/valoraciones";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

/** El formulario de objeción: motivo cerrado y, con «Otro», comentario obligatorio. */
function FormularioObjecion({
  valoracionId,
  alEnviar,
  alCancelar,
}: {
  valoracionId: string;
  alEnviar(): void;
  alCancelar(): void;
}) {
  const { cliente } = useAuth();
  const idGrupo = useId();
  const idComentario = useId();
  const [motivo, setMotivo] = useState<MotivoObjecion | null>(null);
  const [comentario, setComentario] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>(undefined);
  const [errorComentario, setErrorComentario] = useState<string | undefined>(undefined);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErrorGeneral(null);
    const limpio = comentario.trim();
    const faltaMotivo = motivo === null;
    const faltaComentario = motivo === "OTRO" && limpio.length < LARGO_MINIMO_COMENTARIO_OBJECION;
    setErrorMotivo(faltaMotivo ? "Elige un motivo." : undefined);
    setErrorComentario(faltaComentario ? `Con «Otro», explica el problema en al menos ${LARGO_MINIMO_COMENTARIO_OBJECION} caracteres.` : undefined);
    if (faltaMotivo || faltaComentario || motivo === null) return;

    setEnviando(true);
    try {
      await cliente.objetarValoracion(valoracionId, { motivo, comentario: limpio || null });
      alEnviar();
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("comentario")) setErrorComentario(causa.mensajeDe("comentario"));
      else setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible enviar la objeción.");
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 rounded-medio border border-borde bg-niebla p-3 sm:p-4">
      <fieldset aria-describedby={errorMotivo ? `${idGrupo}-error` : undefined}>
        <legend className="text-sm font-bold text-noche">¿Por qué la objetas?</legend>
        <div className="mt-2 space-y-2">
          {MOTIVOS_OBJECION.map((opcion) => (
            <label
              key={opcion}
              className={`flex cursor-pointer items-start gap-3 rounded-chico border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primario ${
                motivo === opcion ? "border-primario bg-hielo" : "border-borde-fuerte bg-blanco hover:border-primario"
              }`}
            >
              <input
                type="radio"
                name={idGrupo}
                value={opcion}
                checked={motivo === opcion}
                onChange={() => {
                  setMotivo(opcion);
                  setErrorMotivo(undefined);
                }}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primario"
              />
              <span>
                <span className="block font-semibold text-noche">{MOTIVO_OBJECION[opcion].texto}</span>
                <span className="block text-texto-suave">{MOTIVO_OBJECION[opcion].ayuda}</span>
              </span>
            </label>
          ))}
        </div>
        {errorMotivo && (
          <p id={`${idGrupo}-error`} className="mt-1.5 text-sm font-medium text-error-700">
            {errorMotivo}
          </p>
        )}
      </fieldset>
      <CampoAreaTexto
        id={idComentario}
        etiqueta={motivo === "OTRO" ? "Comentario" : "Comentario (opcional)"}
        valor={comentario}
        alCambiar={(valor) => {
          setComentario(valor);
          setErrorComentario(undefined);
        }}
        minimo={LARGO_MINIMO_COMENTARIO_OBJECION}
        maximo={LARGO_MAXIMO_COMENTARIO_OBJECION}
        error={errorComentario}
        ayuda="Lo lee el administrador que revisa. El cliente no lo ve."
      />
      {errorGeneral && (
        <p role="alert" className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {errorGeneral}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Boton type="button" variante="secundario" disabled={enviando} onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="button" cargando={enviando} onClick={() => void enviar()}>
          Enviar objeción
        </Boton>
      </div>
    </div>
  );
}

/** El estado de la valoración y de su objeción, en texto (el color solo no basta). */
function EstadoModeracion({ valoracion }: { valoracion: ValoracionRecibida }) {
  if (valoracion.estado === "OCULTA") {
    return (
      <p className="mt-3 rounded-chico border border-exito-700/20 bg-exito-50 px-3 py-2 text-sm text-exito-700">
        <span className="font-semibold">Retirada por moderación.</span> {valoracion.retirada?.motivo ?? ""}
      </p>
    );
  }
  const { objecion } = valoracion;
  if (!objecion) return null;
  if (objecion.estado === "DESESTIMADA") {
    return (
      <p className="mt-3 rounded-chico bg-niebla px-3 py-2 text-sm text-noche">
        <span className="font-semibold">Objeción desestimada:</span> la valoración sigue publicada. {objecion.resolucion ?? ""}
      </p>
    );
  }
  return (
    <p className="mt-3 rounded-chico bg-hielo/60 px-3 py-2 text-sm text-noche">
      <span className="font-semibold">Objeción en revisión</span> ({MOTIVO_OBJECION[objecion.motivo].texto}), enviada el{" "}
      {fecha.format(new Date(objecion.enviadaEn))}. Mientras tanto, la valoración sigue publicada.
    </p>
  );
}

/**
 * /mi/valoraciones: lo que el prestador recibió. No puede eliminar ni
 * ocultar ninguna: solo objetarla una vez, y decide un administrador.
 */
export default function PaginaMisValoraciones() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaRecibidas | null>(null);
  const [error, setError] = useState(false);
  const [objetando, setObjetando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const tienePerfil = estado !== null && !estado.cargando && estado.perfil !== null;

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await cliente.valoracionesRecibidas(pagina));
    } catch {
      setError(true);
    }
  }, [cliente, pagina]);

  useEffect(() => {
    if (tienePerfil) void cargar();
  }, [cargar, tienePerfil]);

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <SeccionArea
      titulo="Valoraciones"
      bajada="Lo que dicen los clientes que te contactaron. No puedes borrar ni ocultar una valoración: si una no corresponde, objétala y un administrador la revisa."
    >
      {estado === null || estado.cargando ? (
        <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil…</p>
      ) : estado.perfil === null ? (
        <CompletarPerfilPrimero motivo="Necesitamos tus datos de prestador antes de mostrar tus valoraciones." />
      ) : error ? (
        <p role="alert" className="mt-6 text-sm text-error-700">
          No fue posible cargar tus valoraciones. Recarga la página para intentarlo de nuevo.
        </p>
      ) : !datos ? (
        <p className="mt-6 text-sm text-texto-suave">Cargando tus valoraciones…</p>
      ) : (
        <div className="mt-6">
          {datos.resumen.promedio === null ? (
            <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-noche">
              {datos.resumen.cantidad === 0
                ? "Aún no tienes valoraciones publicadas."
                : `${textoCantidad(datos.resumen.cantidad)} publicadas. Tu promedio aparece en tu perfil desde la tercera.`}
            </p>
          ) : (
            <Distribucion resumen={datos.resumen} />
          )}

          <p role="status" className={aviso ? "mt-4 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700" : "sr-only"}>
            {aviso}
          </p>

          {datos.valoraciones.length > 0 && (
            <ul aria-label="Valoraciones recibidas" className="mt-5 space-y-3">
              {datos.valoraciones.map((valoracion) => (
                <li key={valoracion.id} className="rounded-medio border border-borde p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-semibold text-noche">{valoracion.cliente.nombre}</span>
                        <Estrellas valor={valoracion.calificacion} tamano={14} />
                        <span className="sr-only">{valoracion.calificacion} de 5 estrellas</span>
                      </p>
                      {valoracion.servicio && <p className="mt-0.5 text-xs font-semibold text-primario">Servicio: {valoracion.servicio.titulo}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        valoracion.estado === "OCULTA" ? "bg-niebla text-texto-suave" : "bg-exito-50 text-exito-700"
                      }`}
                    >
                      {valoracion.estado === "OCULTA" ? "Retirada" : "Publicada"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-texto-suave">
                    {fecha.format(new Date(valoracion.creadaEn))}
                    {valoracion.editada && " · Editada"}
                  </p>
                  {valoracion.comentario && <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-noche">{valoracion.comentario}</p>}

                  <EstadoModeracion valoracion={valoracion} />

                  {valoracion.estado === "PUBLICADA" && !valoracion.objecion && objetando !== valoracion.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setObjetando(valoracion.id);
                        setAviso("");
                      }}
                      className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-chico text-sm font-semibold text-primario hover:text-noche focus-visible:outline-2 focus-visible:outline-primario"
                    >
                      <Icono nombre="escudo" tamano={16} />
                      Objetar esta valoración
                    </button>
                  )}
                  {objetando === valoracion.id && (
                    <FormularioObjecion
                      valoracionId={valoracion.id}
                      alCancelar={() => setObjetando(null)}
                      alEnviar={() => {
                        setObjetando(null);
                        setAviso("Recibimos tu objeción. Un administrador la revisará; mientras tanto, la valoración sigue publicada.");
                        void cargar();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {paginas > 1 && (
            <nav aria-label="Páginas de valoraciones" className="mt-4 flex items-center justify-between gap-3 text-sm">
              <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                Anteriores
              </Boton>
              <span className="text-texto-suave">
                Página {pagina} de {paginas}
              </span>
              <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
                Siguientes
              </Boton>
            </nav>
          )}
        </div>
      )}
    </SeccionArea>
  );
}
