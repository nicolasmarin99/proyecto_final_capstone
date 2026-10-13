import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { LARGO_MAXIMO_MOTIVO_OCULTAR, LARGO_MINIMO_MOTIVO_OCULTAR } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type ImagenModeracion } from "../api/cliente";
import { Boton } from "./Boton";
import { Icono } from "./iconos";
import { CampoAreaTexto } from "./CampoAreaTexto";

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
 */
export function ModeracionImagenes({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
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
        const datos = await cliente.listarImagenesModeracion({ pagina: numero });
        setImagenes((actuales) => (numero === 1 ? datos.imagenes : [...actuales, ...datos.imagenes]));
        setTotal(datos.total);
        setPagina(numero);
      } catch {
        setError("No fue posible cargar las imágenes.");
      } finally {
        setCargando(false);
      }
    },
    [cliente],
  );

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  // Agrupadas por servicio: los servicios con la foto más reciente primero, y
  // dentro de cada uno, las fotos en el orden de su galería.
  const grupos = new Map<string, ImagenModeracion[]>();
  for (const imagen of imagenes) {
    grupos.set(imagen.servicio.id, [...(grupos.get(imagen.servicio.id) ?? []), imagen]);
  }
  for (const delServicio of grupos.values()) delServicio.sort((a, b) => a.orden - b.orden);

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Imágenes de servicios
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        Oculta las fotos que muestren la dirección, la cara o datos de un cliente, o que no correspondan al servicio.
      </p>

      <p role="status" className="sr-only">
        {aviso}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {!cargando && !error && imagenes.length === 0 && <p className="mt-4 text-sm text-texto-suave">Todavía no hay imágenes de servicios.</p>}

      <div className="mt-4 space-y-6">
        {[...grupos.entries()].map(([servicioId, delServicio]) => {
          const primera = delServicio[0];
          if (!primera) return null;
          return (
            <article key={servicioId} aria-label={`Imágenes de «${primera.servicio.titulo}»`}>
              <h3 className="text-sm font-semibold text-noche">
                <Link to={`/servicios/${servicioId}`} className="hover:text-primario">
                  {primera.servicio.titulo}
                </Link>{" "}
                <span className="font-normal text-texto-suave">· {primera.servicio.prestador}</span>
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {delServicio.map((imagen) => (
                  <ImagenModerable
                    key={imagen.id}
                    imagen={imagen}
                    posicion={imagen.orden + 1}
                    cliente={cliente}
                    alOcultar={(actualizada) => {
                      setImagenes((actuales) => actuales.map((otra) => (otra.id === actualizada.id ? actualizada : otra)));
                      setAviso(`Imagen de «${actualizada.servicio.titulo}» oculta.`);
                    }}
                  />
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {cargando && <p className="mt-4 text-sm text-texto-suave">Cargando imágenes…</p>}

      {!cargando && imagenes.length < total && (
        <Boton type="button" variante="secundario" className="mt-4" onClick={() => void cargar(pagina + 1)}>
          Ver más imágenes
        </Boton>
      )}
    </section>
  );
}
