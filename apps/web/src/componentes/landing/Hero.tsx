import { useEffect, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Contenedor } from "./Contenedor";
import { POPULARES, rutaBusqueda } from "./datos";
import { FondoHero } from "./FondoHero";
import { Icono } from "../iconos";
import { usePrefiereMenosMovimiento } from "./usePrefiereMenosMovimiento";

/**
 * Portada: titular, buscador y video.
 *
 * Bajo lg pasa a una columna con el video debajo del texto, y bajo sm el
 * buscador apila sus dos campos y el botón.
 */
export function Hero() {
  const navegar = useNavigate();

  // El formulario no guarda estado en React: se leen los campos al enviar.
  // No hay nada que validar mientras se escribe, así que no hace falta más.
  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    navegar(rutaBusqueda(String(datos.get("servicio") ?? ""), String(datos.get("comuna") ?? "")));
  }

  return (
    <section className="relative overflow-hidden bg-niebla">
      <FondoHero />

      <Contenedor className="relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-[72px] lg:pt-24 lg:pb-28">
        <div className="flex flex-col gap-7">
          <p className="flex items-center gap-2 self-start rounded-full bg-hielo px-3.5 py-2 text-sm font-bold text-primario">
            <Icono nombre="ubicacion" tamano={16} grosor={2} />
            Servicios cerca de ti
          </p>

          <h1 className="font-titulos text-[40px] leading-[1.05] font-extrabold tracking-[-1.5px] text-noche md:text-[52px] xl:text-[64px] xl:tracking-[-2px]">
            Encuentra al experto que tu hogar necesita.
          </h1>

          <p className="max-w-[560px] text-lg leading-[1.55] text-texto-suave md:text-xl">
            Gasfíteres, electricistas, carpinteros, banqueteras y más. Revisa sus certificados y lo que
            opinan sus clientes antes de contactarlos.
          </p>

          <form
            id="buscar"
            role="search"
            onSubmit={buscar}
            className="mt-2 flex scroll-mt-6 flex-col gap-2 rounded-medio border border-borde-fuerte bg-blanco p-2 shadow-buscador sm:flex-row sm:items-center"
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
                className="min-w-0 flex-1 bg-transparent text-[17px] text-noche outline-none placeholder:text-texto-tenue"
              />
            </label>
            <button
              type="submit"
              className="h-14 cursor-pointer rounded-boton bg-primario px-7 text-[17px] font-bold text-blanco transition-colors hover:bg-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
            >
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2.5 text-[15px] text-texto-suave">
            <span>Populares:</span>
            {POPULARES.map((servicio) => (
              <Link
                key={servicio}
                to={rutaBusqueda(servicio)}
                className="rounded-full border border-borde-fuerte bg-blanco px-3 py-1.5 text-noche transition-colors hover:border-primario hover:text-primario focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
              >
                {servicio}
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
      className="aspect-[540/402] w-full max-w-[540px] justify-self-center rounded-grande border border-borde bg-hielo object-cover shadow-video"
    />
  );
}
