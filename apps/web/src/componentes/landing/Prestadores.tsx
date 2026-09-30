import { Link } from "react-router";
import { Contenedor, Sobretitulo } from "./Contenedor";
import { BENEFICIOS_PRESTADOR } from "./datos";
import { Icono } from "../iconos";

const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario";

/** Invitación a quienes ofrecen servicios, con lo que ganan al publicar. */
export function Prestadores() {
  return (
    <section id="prestadores" className="bg-blanco">
      <Contenedor className="grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,580px)] lg:gap-20">
        <div className="flex flex-col gap-6">
          <Sobretitulo>Para prestadores</Sobretitulo>
          <h2 className="font-titulos text-[32px] leading-[1.12] font-bold tracking-[-1px] text-noche md:text-[44px]">
            ¿Ofreces un servicio? Haz que te encuentren.
          </h2>
          <p className="max-w-[540px] text-lg leading-[1.55] text-texto-suave md:text-[19px]">
            Crea tu perfil, sube tus certificados y muestra tus trabajos. Los clientes de tu comuna te
            contactan directamente.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              to="/registro-prestador"
              className={`flex h-[52px] items-center rounded-boton bg-primario px-7 text-[17px] font-bold text-blanco transition-colors hover:bg-noche ${foco}`}
            >
              Publicar mi servicio
            </Link>
            <a
              href="#como-funciona"
              className={`flex h-[52px] items-center rounded-boton border border-borde-fuerte px-6 text-[17px] font-bold text-primario transition-colors hover:bg-hielo ${foco}`}
            >
              Saber más
            </a>
          </div>
        </div>

        <ul className="flex flex-col gap-4">
          {BENEFICIOS_PRESTADOR.map((beneficio) => (
            <li
              key={beneficio.titulo}
              className="flex items-start gap-5 rounded-[20px] border border-borde px-6 py-6 md:px-7"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-hielo text-primario">
                <Icono nombre={beneficio.icono} />
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="font-titulos text-[19px] font-bold text-noche">{beneficio.titulo}</span>
                <span className="leading-normal text-texto-suave">{beneficio.texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </Contenedor>
    </section>
  );
}
