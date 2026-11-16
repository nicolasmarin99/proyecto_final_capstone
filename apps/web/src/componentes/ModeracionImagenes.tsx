import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { LARGO_MAXIMO_MOTIVO_OCULTAR, LARGO_MINIMO_MOTIVO_OCULTAR } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type ImagenModeracion } from "../api/cliente";
import { Boton } from "./Boton";
import { Icono } from "./iconos";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { Titulo } from "./Titulo";

const fechaCorta = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

/** Una imagen con su estado y, si está visible, la acción de ocultarla con motivo. */
function ImagenModerable({
  imagen,
  posicion,
  cliente,
  alOcultar,
}: {
  imagen: ImagenModeracion;
  posicion: number;
  cliente: ClienteApi;
  alOcultar(actualizada: ImagenModeracion): void;
}) {
  const idMotivo = useId();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const oculta = imagen.estado === "OCULTA";

  async function ocultar() {
    const limpio = motivo.trim();
    if (limpio.length < LARGO_MINIMO_MOTIVO_OCULTAR) {
      setError(`Explica el motivo en al menos ${LARGO_MINIMO_MOTIVO_OCULTAR} caracteres.`);
      return;
    }
    setEnviando(true);
    setError(undefined);
    try {
      const actualizada = await cliente.ocultarImagen(imagen.id, limpio);
      alOcultar({ ...imagen, ...actualizada });
      setAbierto(false);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? (causa.mensajeDe("motivo") ?? causa.message) : "No fue posible ocultar la imagen.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li className="rounded-medio border border-borde bg-blanco p-2">
      {imagen.estado === "VISIBLE" ? (
        <a href={imagen.url} target="_blank" rel="noreferrer" className="block rounded-chico focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario">
          <img
            src={imagen.miniatura}
            alt={`Foto ${posicion} de «${imagen.servicio.titulo}», abrir en tamaño completo`}
            className="aspect-[4/3] w-full rounded-chico bg-niebla object-cover"
          />
        </a>
      ) : (
        // El archivo se borró al ocultarla: no hay nada que cargar.
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-chico bg-niebla text-texto-suave">
          <Icono nombre="escudo" tamano={24} grosor={1.8} />
          <span className="text-xs font-semibold">Archivo eliminado</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${oculta ? "bg-alerta-50 text-alerta-700" : "bg-exito-50 text-exito-700"}`}>
          {oculta ? "Oculta" : "Visible"}
        </span>
        <span className="text-texto-suave">{fechaCorta.format(new Date(imagen.subidaEn))}</span>
      </div>

      {oculta && (
        <p className="mt-2 text-xs text-texto-suave">
          <span className="font-semibold text-noche">Motivo:</span> {imagen.motivoOcultamiento}
          {imagen.ocultadaPor ? ` · ${imagen.ocultadaPor}` : ""}
        </p>
      )}

      {!oculta && !abierto && (
        <Boton type="button" variante="secundario" className="mt-2 h-10! text-sm" onClick={() => setAbierto(true)}>
          Ocultar
        </Boton>
      )}

      {!oculta && abierto && (
        <div className="mt-1">
          <CampoAreaTexto
            id={idMotivo}
            etiqueta="Motivo (lo verá el prestador)"
            valor={motivo}
            alCambiar={(valor) => {
              setMotivo(valor);
              setError(undefined);
            }}
            minimo={LARGO_MINIMO_MOTIVO_OCULTAR}
            maximo={LARGO_MAXIMO_MOTIVO_OCULTAR}
            error={error}
          />
          <p className="mt-2 text-xs text-alerta-700">
            No se puede deshacer: el archivo se borra de internet. Si la foto era correcta, el prestador tendrá que
            subirla de nuevo.
          </p>
          <div className="mt-3 grid gap-2">
            <Boton type="button" cargando={enviando} className="h-10! text-sm" onClick={() => void ocultar()}>
              Ocultar imagen
            </Boton>
            <Boton type="button" variante="secundario" disabled={enviando} className="h-10! text-sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Moderación de las fotos de servicios: las más recientes primero, agrupadas
 * por servicio. Ocultar no borra el archivo: la imagen deja de mostrarse en
 * la página pública y en la búsqueda, y queda registrado quién, cuándo y por
 * qué. El prestador ve el motivo en su formulario.
 *
 * Con `prestadorId` muestra solo las fotos POR REVISAR de ese prestador
 * (visibles y que ningún administrador ha mirado) y agrega «Marcar como
 * revisadas»: las fotos siguen publicadas y dejan de figurar como pendientes.
 */
export function ModeracionImagenes({
  cliente,
  prestadorId,
  alCambiar,
}: {
  cliente: ClienteApi;
  /** Solo lo de ese prestador (id de su perfil): la cola va desplegada dentro de él. */
  prestadorId?: string;
  /** Avisa que algo se resolvió, para actualizar los conteos del prestador. */
  alCambiar?(): void;
}) {
  const idTitulo = useId();
  const [marcando, setMarcando] = useState(false);
  const [imagenes, setImagenes] = useState<ImagenModeracion[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(
    async (numero: number) => {
      setCargando(true);
      setError(null);
      try {
        const datos = await cliente.listarImagenesModeracion({ pagina: numero, prestadorId, sinRevisar: prestadorId !== undefined });
        setImagenes((actuales) => (numero === 1 ? datos.imagenes : [...actuales, ...datos.imagenes]));
        setTotal(datos.total);
        setPagina(numero);
      } catch {
        setError("No fue posible cargar las imágenes.");
      } finally {
        setCargando(false);
      }
    },
    [cliente, prestadorId],
  );

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  // Solo las que están a la vista y siguen por revisar: una foto subida
  // mientras el administrador revisaba no se marca sin que la haya mirado.
  const porRevisar = imagenes.filter((imagen) => imagen.porRevisar && imagen.estado === "VISIBLE");

  async function marcarRevisadas() {
    setMarcando(true);
    setError(null);
    try {
      const cantidad = await cliente.marcarImagenesRevisadas(porRevisar.map((imagen) => imagen.id));
      setAviso(cantidad === 1 ? "1 imagen marcada como revisada." : `${cantidad} imágenes marcadas como revisadas.`);
      await cargar(1);
      alCambiar?.();
    } catch {
      setError("No fue posible marcar las imágenes como revisadas.");
    } finally {
      setMarcando(false);
    }
  }

  // Agrupadas por servicio: los servicios con la foto más reciente primero, y
  // dentro de cada uno, las fotos en el orden de su galería.
  const grupos = new Map<string, ImagenModeracion[]>();
  for (const imagen of imagenes) {
    grupos.set(imagen.servicio.id, [...(grupos.get(imagen.servicio.id) ?? []), imagen]);
  }
  for (const delServicio of grupos.values()) delServicio.sort((a, b) => a.orden - b.orden);

  return (
    <section aria-labelledby={idTitulo} className={prestadorId ? "mt-6" : "mt-8 border-t border-borde pt-6"}>
      <Titulo profundidad={0} id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        {prestadorId ? "Imágenes por revisar" : "Imágenes de servicios"}
      </Titulo>
      <p className="mt-1 text-sm text-texto-suave">
        Oculta las fotos que muestren la dirección, la cara o datos de un cliente, o que no correspondan al servicio.
        {prestadorId && " Si están bien, márcalas como revisadas: siguen publicadas y dejan de figurar como pendientes."}
      </p>

      {/* Una sola región en vivo, siempre presente, que se ve cuando tiene algo que decir. */}
      <p
        role="status"
        className={aviso && prestadorId ? "mt-3 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700" : "sr-only"}
      >
        {aviso}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {!cargando && !error && imagenes.length === 0 && (
        <p className="mt-4 text-sm text-texto-suave">{prestadorId ? "No quedan imágenes por revisar." : "Todavía no hay imágenes de servicios."}</p>
      )}

      <div className="mt-4 space-y-6">
        {[...grupos.entries()].map(([servicioId, delServicio]) => {
          const primera = delServicio[0];
          if (!primera) return null;
          return (
            <article key={servicioId} aria-label={`Imágenes de «${primera.servicio.titulo}»`}>
              <Titulo profundidad={1} className="text-sm font-semibold text-noche">
                <Link to={`/servicios/${servicioId}`} className="hover:text-primario">
                  {primera.servicio.titulo}
                </Link>{" "}
                <span className="font-normal text-texto-suave">· {primera.servicio.prestador}</span>
              </Titulo>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {delServicio.map((imagen) => (
                  <ImagenModerable
                    key={imagen.id}
                    imagen={imagen}
                    posicion={imagen.orden + 1}
                    cliente={cliente}
                    alOcultar={(actualizada) => {
                      // Oculta: ya se decidió sobre ella, deja de estar por revisar.
                      setImagenes((actuales) => actuales.map((otra) => (otra.id === actualizada.id ? { ...actualizada, porRevisar: false } : otra)));
                      setAviso(`Imagen de «${actualizada.servicio.titulo}» oculta.`);
                      alCambiar?.();
                    }}
                  />
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {cargando && <p className="mt-4 text-sm text-texto-suave">Cargando imágenes…</p>}

      {prestadorId && porRevisar.length > 0 && (
        <Boton type="button" cargando={marcando} className="mt-4 h-auto! min-h-12 px-4 py-2.5 sm:w-auto! sm:px-6" onClick={() => void marcarRevisadas()}>
          {marcando
            ? "Marcando…"
            : porRevisar.length === 1
              ? "Marcar la imagen como revisada"
              : `Marcar las ${porRevisar.length} imágenes como revisadas`}
        </Boton>
      )}

      {!cargando && imagenes.length < total && (
        <Boton type="button" variante="secundario" className="mt-4" onClick={() => void cargar(pagina + 1)}>
          Ver más imágenes
        </Boton>
      )}
    </section>
  );
}
