import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { LogoLocalCL } from "../LogoLocalCL";
import { Contenedor } from "./Contenedor";
import { Icono } from "../iconos";

const SECCIONES = [
  { href: "/#servicios", texto: "Servicios" },
  { href: "/#como-funciona", texto: "Cómo funciona" },
  { href: "/#prestadores", texto: "Para prestadores" },
];

const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario";

/**
 * Barra superior. En escritorio muestra todo en una fila, como el diseño.
 * Bajo lg no caben las tres secciones y los dos botones, así que se agrupan
 * en un menú desplegable.
 *
 * Las secciones apuntan a "/#..." y no a "#...": así funcionan también desde
 * otras páginas que reusan esta barra, como /buscar.
 */
export function Navbar() {
  const [abierto, setAbierto] = useState(false);
  const idMenu = useId();

  // Escape cierra el menú: es lo que espera quien navega con teclado.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const cerrar = () => setAbierto(false);

  return (
    <header className="border-b border-borde bg-blanco">
      <Contenedor className="flex h-[84px] items-center justify-between gap-6">
        <Link to="/" className={`rounded-chico ${foco}`}>
          <LogoLocalCL claseTexto="text-2xl font-bold tracking-[-0.5px] text-noche" />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-9 font-medium lg:flex">
          {SECCIONES.map((s) => (
            <a key={s.href} href={s.href} className={`rounded-sm text-noche hover:text-primario ${foco}`}>
              {s.texto}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/iniciar-sesion"
            className={`flex h-11 items-center rounded-chico px-5 text-[15px] font-semibold text-primario transition-colors hover:bg-hielo ${foco}`}
          >
            Iniciar sesión
          </Link>
          <Link
            to="/registro-prestador"
            className={`flex h-11 items-center rounded-chico bg-primario px-[22px] text-[15px] font-bold text-blanco transition-colors hover:bg-noche ${foco}`}
          >
            Publica tu servicio
          </Link>
        </div>

        <button
          type="button"
          className={`flex size-11 cursor-pointer items-center justify-center rounded-chico text-noche hover:bg-niebla lg:hidden ${foco}`}
          aria-expanded={abierto}
          aria-controls={idMenu}
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setAbierto((a) => !a)}
        >
          <Icono nombre={abierto ? "cerrar" : "menu"} grosor={2} />
        </button>
      </Contenedor>

      {abierto && (
        <div id={idMenu} className="border-t border-borde motion-safe:animate-aparecer-corto lg:hidden">
          <Contenedor className="flex flex-col gap-1 py-4">
            <nav aria-label="Principal" className="flex flex-col">
              {SECCIONES.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  onClick={cerrar}
                  className={`flex min-h-12 items-center rounded-chico px-3 font-medium text-noche hover:bg-niebla ${foco}`}
                >
                  {s.texto}
                </a>
              ))}
            </nav>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Link
                to="/iniciar-sesion"
                className={`flex min-h-12 items-center justify-center rounded-chico border border-borde-fuerte font-semibold text-primario ${foco}`}
              >
                Iniciar sesión
              </Link>
              <Link
                to="/registro-prestador"
                className={`flex min-h-12 items-center justify-center rounded-chico bg-primario font-bold text-blanco ${foco}`}
              >
                Publica tu servicio
              </Link>
            </div>
          </Contenedor>
        </div>
      )}
    </header>
  );
}
