import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { MAXIMO_IMAGENES_SERVICIO, TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN_PERMITIDOS } from "@localcl/shared";
import { ErrorApi, type ImagenPropia } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Icono } from "./iconos";

const MEGAS = TAMANO_MAXIMO_IMAGEN / (1024 * 1024);
const TIPOS: readonly string[] = TIPOS_IMAGEN_PERMITIDOS;

/** Revisión en el navegador para avisar antes de subir. La que manda es la de la API, por los bytes. */
function problemaDe(archivo: File): string | null {
  if (!TIPOS.includes(archivo.type)) return `«${archivo.name}» no es una imagen JPG, PNG o WEBP.`;
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) return `«${archivo.name}» supera los ${MEGAS} MB.`;
  return null;
}

/** Vista previa local de un archivo. En entornos sin createObjectURL (pruebas) queda vacía. */
function vistaPrevia(archivo: File): string {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(archivo) : "";
}

function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  if (elemento !== undefined) copia.splice(hasta, 0, elemento);
  return copia;
}

interface Elemento {
  clave: string;
  src: string;
}

interface Props {
  /**
   * Con id (editar), cada cambio va a la API en el momento. Sin id (servicio
   * nuevo todavía no guardado), las fotos quedan acá, en `pendientes`, y el
   * formulario las sube después de crear el servicio.
   */
  servicioId: string | null;
  iniciales: ImagenPropia[];
  pendientes: File[];
  alCambiarPendientes(archivos: File[]): void;
}

/**
 * Fotos de trabajos anteriores de un servicio: agregar con vista previa,
 * eliminar y reordenar, arrastrando o con botones (el arrastre no sirve con
 * teclado ni con lector de pantalla; los botones sí). Un anuncio en vivo
 * dice qué cambió. La primera foto es la portada y la miniatura.
 *
 * Las fotos ocultadas por moderación van aparte: su archivo ya se borró, así
 * que se muestra un marcador con el motivo. No se reordenan, pero sí se
 * eliminan (la evidencia de la moderación queda en la bitácora del
 * servidor) y siguen ocupando su lugar en el límite hasta que se eliminan.
 */
export function GestorImagenes({ servicioId, iniciales, pendientes, alCambiarPendientes }: Props) {
  const { cliente } = useAuth();
  const idTitulo = useId();
  const idEntrada = useId();
  const idAyuda = useId();
  const [guardadas, setGuardadas] = useState<ImagenPropia[]>(iniciales);
  const [subiendo, setSubiendo] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [anuncio, setAnuncio] = useState("");
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  const enLinea = servicioId !== null;

  // Las URL locales de las vistas previas se liberan cuando ya no se usan.
  const previas = useMemo(() => pendientes.map(vistaPrevia), [pendientes]);
  useEffect(
    () => () => {
      for (const url of previas) if (url) URL.revokeObjectURL(url);
    },
    [previas],
  );

  const visibles = guardadas.filter((imagen) => imagen.estado === "VISIBLE");
  const ocultas = guardadas.filter((imagen) => imagen.estado === "OCULTA");

  const elementos: Elemento[] = enLinea
    ? visibles.map((imagen) => ({ clave: imagen.id, src: imagen.miniatura }))
    : pendientes.map((archivo, indice) => ({ clave: `${archivo.name}-${indice}`, src: previas[indice] ?? "" }));

  // Las ocultas ocupan cupo hasta que el prestador las elimina.
  const total = elementos.length + (enLinea ? ocultas.length : 0) + subiendo;
  const quedan = MAXIMO_IMAGENES_SERVICIO - total;

  function mensajeError(causa: unknown, porDefecto: string) {
    return causa instanceof ErrorApi ? (causa.mensajeDe("imagen") ?? causa.message) : porDefecto;
  }

  async function agregar(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(evento.target.files ?? []);
    // Se limpia para poder volver a elegir el mismo archivo después de un error.
    evento.target.value = "";
    if (elegidos.length === 0) return;

    const problemas: string[] = [];
    const validos: File[] = [];
    for (const archivo of elegidos) {
      const problema = problemaDe(archivo);
      if (problema) problemas.push(problema);
      else if (validos.length < quedan) validos.push(archivo);
      else problemas.push(`«${archivo.name}» no se agregó: el máximo es ${MAXIMO_IMAGENES_SERVICIO} fotos.`);
    }
    setErrores(problemas);

    if (!enLinea) {
      alCambiarPendientes([...pendientes, ...validos]);
      if (validos.length > 0) setAnuncio(`${validos.length === 1 ? "Foto agregada" : `${validos.length} fotos agregadas`}. Se subirán al guardar.`);
      return;
    }

    // Una a la vez: así cada error se asocia a su archivo y el orden se respeta.
    setSubiendo(validos.length);
    let subidas = 0;
    for (const archivo of validos) {
      try {
        const imagen = await cliente.subirImagenServicio(servicioId, archivo);
        setGuardadas((actuales) => [...actuales, imagen]);
        subidas += 1;
      } catch (causa) {
        problemas.push(`«${archivo.name}»: ${mensajeError(causa, "no se pudo subir.")}`);
        setErrores([...problemas]);
      }
      setSubiendo((n) => n - 1);
    }
    if (subidas > 0) setAnuncio(subidas === 1 ? "Foto subida." : `${subidas} fotos subidas.`);
  }

  async function moverA(desde: number, hasta: number) {
    if (hasta < 0 || hasta >= elementos.length || desde === hasta) return;
    setErrores([]);
    const posicion = `Foto movida a la posición ${hasta + 1} de ${elementos.length}.`;

    if (!enLinea) {
      alCambiarPendientes(mover(pendientes, desde, hasta));
      setAnuncio(posicion);
      return;
    }

    const anterior = guardadas;
    const nuevo = mover(visibles, desde, hasta);
    // Las ocultas no se reordenan: quedan al final, como las deja la API.
    setGuardadas([...nuevo, ...ocultas]);
    setOcupado(true);
    try {
      setGuardadas(await cliente.ordenarImagenesServicio(servicioId, nuevo.map((imagen) => imagen.id)));
      setAnuncio(posicion);
    } catch (causa) {
      setGuardadas(anterior);
      setErrores([mensajeError(causa, "No se pudo cambiar el orden. Intenta de nuevo.")]);
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(indice: number) {
    setErrores([]);

    if (!enLinea) {
      alCambiarPendientes(pendientes.filter((_, actual) => actual !== indice));
      setAnuncio("Foto quitada.");
      return;
    }

    const imagen = visibles[indice];
    if (imagen) await eliminarGuardada(imagen.id);
  }

  /** Borra una foto ya subida, visible u oculta. */
  async function eliminarGuardada(id: string) {
    if (!servicioId) return;
    setErrores([]);
    setOcupado(true);
    try {
      await cliente.eliminarImagenServicio(servicioId, id);
      setGuardadas((actuales) => actuales.filter((otra) => otra.id !== id));
      setAnuncio("Foto eliminada.");
    } catch (causa) {
      setErrores([mensajeError(causa, "No se pudo eliminar la foto. Intenta de nuevo.")]);
    } finally {
      setOcupado(false);
    }
  }

  const botonChico =
    "flex size-11 cursor-pointer items-center justify-center rounded-chico border border-borde-fuerte bg-blanco text-noche transition-colors hover:border-primario hover:text-primario disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario";

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Fotos de trabajos anteriores <span className="text-sm font-medium text-texto-suave">(opcional)</span>
      </h2>
      <p id={idAyuda} className="mt-1 text-sm text-texto-suave">
        Hasta {MAXIMO_IMAGENES_SERVICIO} fotos JPG, PNG o WEBP de hasta {MEGAS} MB cada una. La primera es la portada
        que se ve en los resultados de búsqueda.
      </p>

      <div className="mt-3 flex gap-2.5 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
        <Icono nombre="escudo" tamano={18} grosor={2} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Cuida la privacidad de tus clientes.</p>
          <p className="mt-0.5">
            No subas fotos donde se reconozca la dirección, la fachada, la patente del auto, la cara o datos de tus
            clientes. Al subirlas quitamos los metadatos de la foto, como la ubicación GPS que guarda el celular.
          </p>
        </div>
      </div>

      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {errores.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm font-medium text-error-700">
          {errores.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {(elementos.length > 0 || subiendo > 0) && (
        <ol aria-label="Fotos del servicio, en orden" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {elementos.map((elemento, indice) => (
            <li
              key={elemento.clave}
              draggable={!ocupado}
              onDragStart={() => setArrastrando(indice)}
              onDragOver={(evento) => evento.preventDefault()}
              onDrop={(evento) => {
                evento.preventDefault();
                if (arrastrando !== null) void moverA(arrastrando, indice);
                setArrastrando(null);
              }}
              onDragEnd={() => setArrastrando(null)}
              className={`rounded-medio border bg-blanco p-2 transition-shadow ${
                arrastrando === indice ? "border-primario opacity-60" : "border-borde"
              } cursor-grab active:cursor-grabbing`}
            >
              <div className="relative">
                {elemento.src ? (
                  <img src={elemento.src} alt={`Foto ${indice + 1} de ${elementos.length}`} className="aspect-[4/3] w-full rounded-chico bg-niebla object-cover" />
                ) : (
                  <div role="img" aria-label={`Foto ${indice + 1} de ${elementos.length}`} className="aspect-[4/3] w-full rounded-chico bg-niebla" />
                )}
                {indice === 0 && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-primario px-2 py-0.5 text-xs font-bold text-blanco">Portada</span>
                )}
              </div>
              <div className="mt-2 flex justify-between gap-1.5">
                <div className="flex gap-1.5">
                  <button type="button" className={botonChico} disabled={ocupado || indice === 0} onClick={() => void moverA(indice, indice - 1)} aria-label={`Mover la foto ${indice + 1} antes`}>
                    <Icono nombre="flechaAbajo" tamano={18} grosor={2} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    className={botonChico}
                    disabled={ocupado || indice === elementos.length - 1}
                    onClick={() => void moverA(indice, indice + 1)}
                    aria-label={`Mover la foto ${indice + 1} después`}
                  >
                    <Icono nombre="flechaAbajo" tamano={18} grosor={2} className="-rotate-90" />
                  </button>
                </div>
                <button type="button" className={`${botonChico} hover:border-error-700! hover:text-error-700!`} disabled={ocupado} onClick={() => void eliminar(indice)} aria-label={`Eliminar la foto ${indice + 1}`}>
                  <Icono nombre="cerrar" tamano={18} grosor={2} />
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: subiendo }, (_, indice) => (
            <li key={`subiendo-${indice}`} aria-busy="true" className="rounded-medio border border-dashed border-borde-fuerte p-2">
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-chico bg-niebla text-sm text-texto-suave motion-safe:animate-pulse">
                Subiendo…
              </div>
            </li>
          ))}
        </ol>
      )}

      {ocultas.length > 0 && (
        <div className="mt-5 rounded-medio border border-alerta-700/20 bg-alerta-50 p-3">
          <h3 className="text-sm font-semibold text-alerta-700">Fotos ocultas por moderación</h3>
          <p className="mt-0.5 text-xs text-alerta-700">
            Un administrador las quitó: se borraron de internet y no se pueden volver a mostrar. Siguen ocupando un
            lugar del límite de {MAXIMO_IMAGENES_SERVICIO} hasta que las elimines; después puedes subir otra.
          </p>
          <ul aria-label="Fotos ocultas por moderación" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ocultas.map((imagen) => (
              <li key={imagen.id} className="rounded-medio border border-borde bg-blanco p-2">
                {/* Sin archivo: en su lugar, un marcador. */}
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-chico bg-niebla text-texto-suave">
                  <Icono nombre="escudo" tamano={24} grosor={1.8} />
                  <span className="text-xs font-semibold">Foto oculta</span>
                </div>
                <p className="mt-2 text-xs text-noche">
                  <span className="font-semibold">Motivo:</span> {imagen.motivoOcultamiento}
                </p>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void eliminarGuardada(imagen.id)}
                  className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-chico border border-borde-fuerte bg-blanco text-sm font-semibold text-noche transition-colors hover:border-error-700 hover:text-error-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
                >
                  <Icono nombre="cerrar" tamano={16} grosor={2} />
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <input
          id={idEntrada}
          type="file"
          accept={TIPOS_IMAGEN_PERMITIDOS.join(",")}
          multiple
          disabled={quedan <= 0 || subiendo > 0}
          onChange={(evento) => void agregar(evento)}
          aria-describedby={idAyuda}
          className="peer sr-only"
        />
        <label
          htmlFor={idEntrada}
          className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-boton border border-borde-fuerte bg-blanco px-5 font-bold text-primario transition-colors hover:bg-hielo peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primario peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          <Icono nombre="mas" tamano={20} grosor={2} />
          {quedan > 0 ? "Agregar fotos" : "Llegaste al máximo de fotos"}
        </label>
        <span className="ml-3 text-sm text-texto-suave">
          {total} de {MAXIMO_IMAGENES_SERVICIO}
        </span>
      </div>
    </section>
  );
}
