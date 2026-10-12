import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { clienteApi, type ClienteApi, type Comuna } from "../../api/cliente";
import { normalizarNombre, rutaBuscar } from "../../servicios/filtrosBusqueda";
import { Contenedor } from "./Contenedor";
import { POPULARES } from "./datos";
import { FondoHero } from "./FondoHero";
import { Icono } from "../iconos";
import { usePrefiereMenosMovimiento } from "./usePrefiereMenosMovimiento";

/*
  Entrada escalonada al cargar: cada bloque llega 80ms después del anterior,
  así el ojo recorre la portada en orden (etiqueta, titular, texto,
  buscador). Pasa una sola vez; después el hero queda quieto salvo el fondo.

  El retraso va en style y no como clase [animation-delay:...]: la clase
  animate-aparecer usa la propiedad abreviada `animation`, que fija el retraso
  en 0, y según el orden del CSS generado podía pisar a la clase del retraso.
  El estilo en línea siempre gana.
*/

/**
 * Portada: titular, buscador y video.
 *
 * Bajo lg pasa a una columna con el video debajo del texto, y bajo sm el
 * buscador apila sus dos campos y el botón.
 */
export function Hero({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const idSugerencias = useId();
  const idErrorComuna = useId();
  const comunas = useRef<Promise<Comuna[]> | null>(null);
  const [opciones, setOpciones] = useState<Comuna[]>([]);
  const [errorComuna, setErrorComuna] = useState<string | null>(null);

  /**
   * Las 346 comunas se piden recién cuando alguien va a escribir una (al
   * enfocar el campo), no al cargar la portada. Se piden una sola vez.
   */
  function cargarComunas(): Promise<Comuna[]> {
    comunas.current ??= cliente.listarComunas().catch(() => []);
    void comunas.current.then(setOpciones);
    return comunas.current;
  }

  // Los campos se leen al enviar. La comuna escrita se traduce a su código
  // (la búsqueda filtra por id): «nunoa» o «Ñuñoa» encuentran la misma.
  async function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const q = String(datos.get("servicio") ?? "");
    const textoComuna = normalizarNombre(String(datos.get("comuna") ?? ""));

    if (!textoComuna) {
      navegar(rutaBuscar({ q }));
      return;
    }

    const lista = await cargarComunas();
    const comuna = lista.find((candidata) => normalizarNombre(candidata.nombre) === textoComuna);

    if (comuna) {
      setErrorComuna(null);
      navegar(rutaBuscar({ q, comuna: comuna.id }));
    } else if (lista.length === 0) {
      // Sin la lista no se puede traducir: se busca igual, y en /buscar se elige.
      navegar(rutaBuscar({ q }));
    } else {
      setErrorComuna("No encontramos esa comuna. Elige una de la lista.");
    }
  }

  return (
    <section className="relative overflow-hidden bg-niebla">
      <FondoHero />

      <Contenedor className="relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-[72px] lg:pt-24 lg:pb-28">
        <div className="flex flex-col gap-7">
          <p className="motion-safe:animate-aparecer flex items-center gap-2 self-start rounded-full bg-hielo px-3.5 py-2 text-sm font-bold text-primario">
            <Icono nombre="ubicacion" tamano={16} grosor={2} />
            Servicios cerca de ti
          </p>

          <h1
            className="motion-safe:animate-aparecer font-titulos text-[40px] leading-[1.05] font-extrabold tracking-[-1.5px] text-noche md:text-[52px] xl:text-[64px] xl:tracking-[-2px]"
            style={{ animationDelay: "80ms" }}
          >
            Encuentra al experto que tu hogar necesita.
          </h1>

          <p
            className="motion-safe:animate-aparecer max-w-[560px] text-lg leading-[1.55] text-texto-suave md:text-xl"
            style={{ animationDelay: "160ms" }}
          >
            Gasfíteres, electricistas, carpinteros, banqueteras y más. Revisa sus certificados y lo que
            opinan sus clientes antes de contactarlos.
          </p>

          <form
            id="buscar"
            role="search"
            onSubmit={buscar}
            className="motion-safe:animate-aparecer mt-2 flex scroll-mt-6 flex-col gap-2 rounded-medio border border-borde-fuerte bg-blanco p-2 shadow-buscador sm:flex-row sm:items-center"
            style={{ animationDelay: "240ms" }}
          >
            <label className="flex h-14 rounded-chico focus-within:outline-2 focus-within:outline-primario flex-1 items-center gap-2.5 border-b border-borde px-3.5 sm:border-r sm:border-b-0">
              <Icono nombre="lupa" tamano={22} grosor={2} className="shrink-0 text-primario" />
              <span className="sr-only">Servicio</span>
              <input
                name="servicio"
                type="text"
                placeholder="¿Qué necesitas? Ej: gasfiter"
                className="min-w-0 flex-1 bg-transparent text-[17px] text-noche outline-none placeholder:text-texto-tenue"
              />
            </label>
            <label className="flex h-14 rounded-chico focus-within:outline-2 focus-within:outline-primario items-center gap-2.5 px-3.5 sm:w-[220px]">
              <Icono nombre="ubicacion" tamano={22} grosor={2} className="shrink-0 text-primario" />
              <span className="sr-only">Comuna</span>
              <input
                name="comuna"
                type="text"
                placeholder="Comuna"
                autoComplete="address-level2"
                list={idSugerencias}
                onFocus={() => void cargarComunas()}
                onChange={() => setErrorComuna(null)}
                aria-invalid={errorComuna ? true : undefined}
                aria-describedby={errorComuna ? idErrorComuna : undefined}
                className="min-w-0 flex-1 bg-transparent text-[17px] text-noche outline-none placeholder:text-texto-tenue"
              />
              {/* Sugerencias nativas del navegador mientras se escribe. */}
              <datalist id={idSugerencias}>
                {opciones.map((comuna) => (
                  <option key={comuna.id} value={comuna.nombre} />
                ))}
              </datalist>
            </label>
            <button
              type="submit"
              className="h-14 cursor-pointer rounded-boton bg-primario px-7 text-[17px] font-bold text-blanco transition-[background-color,transform] duration-200 hover:bg-noche motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
            >
              Buscar
            </button>
          </form>
          {errorComuna && (
            <p id={idErrorComuna} role="alert" className="-mt-4 text-sm font-medium text-error-700">
              {errorComuna}
            </p>
          )}

          <div
            className="motion-safe:animate-aparecer flex flex-wrap items-center gap-2.5 text-[15px] text-texto-suave"
            style={{ animationDelay: "320ms" }}
          >
            <span>Populares:</span>
            {POPULARES.map((categoria) => (
              <Link
                key={categoria.slug}
                to={rutaBuscar({ categoria: categoria.slug })}
                className="rounded-full border border-borde-fuerte bg-blanco px-3 py-1.5 text-noche transition-colors hover:border-primario hover:text-primario focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
              >
                {categoria.nombre}
              </Link>
            ))}
          </div>
        </div>

        <VideoHero />
      </Contenedor>
    </section>
  );
}

/**
 * Video en loop. Tres atributos lo hacen reproducirse solo:
 * - muted: los navegadores bloquean el autoplay con sonido.
 * - playsInline: sin él, iOS lo abre a pantalla completa.
 * - autoPlay: solo si la persona no pidió reducir el movimiento.
 *
 * Es decorativo (aria-hidden): no cuenta nada que el texto no diga ya.
 */
function VideoHero() {
  const reducirMovimiento = usePrefiereMenosMovimiento();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const elemento = video.current;
    if (!elemento) return;
    // React pasa `muted` como propiedad y no como atributo; Safari a veces
    // no lo ve a tiempo para permitir el autoplay. Fijarlo aquí lo asegura.
    elemento.muted = true;
    // Si la preferencia cambia con la página abierta, se detiene.
    if (reducirMovimiento) elemento.pause();
  }, [reducirMovimiento]);

  return (
    <video
      ref={video}
      src="/hero.mp4"
      autoPlay={!reducirMovimiento}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      width={540}
      height={402}
      className="motion-safe:animate-aparecer aspect-[540/402] w-full max-w-[540px] justify-self-center rounded-grande border border-borde bg-hielo object-cover shadow-video"
      style={{ animationDelay: "200ms" }}
    />
  );
}
