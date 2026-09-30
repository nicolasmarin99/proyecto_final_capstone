import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icono } from "./iconos";
import { LogoLocalCL } from "./LogoLocalCL";

interface Props {
  sobretitulo?: string;
  titulo: string;
  intro?: string;
  children: ReactNode;
}

/**
 * Pantalla partida para registro, inicio de sesión y recuperación de cuenta.
 *
 * El panel izquierdo existe porque estas son las únicas pantallas que ve
 * alguien que todavía no sabe qué es LocalCL: es el momento de explicar por
 * qué esta plataforma no es una lista de contactos más. Desaparece bajo lg,
 * donde el espacio es del formulario y el mensaje se reduce a la marca.
 *
 * El panel repite el lenguaje de la landing (malla de puntos, azul noche,
 * Sora), para que pasar de la portada al registro no se sienta como cambiar
 * de sitio.
 */
export function PaginaAuth({ sobretitulo, titulo, intro, children }: Props) {
  return (
    // Grid y no flex: las pistas de Tailwind son minmax(0,1fr), así que la
    // columna nunca hereda el piso de min-content que arrastra un hijo flex.
    <div className="grid min-h-screen grid-cols-1 bg-blanco lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-noche p-12 lg:flex">
        {/* Fondo decorativo: la misma malla del hero, en tono noche. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(var(--color-noche-borde)_1.4px,transparent_1.6px)] bg-size-[28px_28px] motion-safe:animate-malla" />
          <div className="absolute -right-32 -bottom-40 size-[420px] rounded-full bg-primario/25 motion-safe:animate-deriva" />
        </div>

        <Link
          to="/"
          className="relative self-start rounded-chico focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blanco"
        >
          <LogoLocalCL variante="invertido" claseTexto="text-2xl font-bold tracking-[-0.5px] text-blanco" />
        </Link>

        <div className="relative">
          <h2 className="font-titulos text-[2.6rem] leading-[1.12] font-bold tracking-[-1px] text-blanco">
            Contrata con respaldo,
            <br />
            no con suerte.
          </h2>

          <p className="mt-5 max-w-sm text-base leading-relaxed text-noche-texto">
            Cada prestador acredita sus certificados contra registros oficiales antes de aparecer
            en la plataforma.
          </p>

          <div className="mt-8 flex items-center gap-3 rounded-medio border border-noche-borde bg-blanco/5 px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-chico bg-primario text-blanco">
              <Icono nombre="escudo" tamano={20} grosor={2} />
            </span>
            <span className="text-sm font-medium text-blanco">
              Credenciales contrastadas con el registro oficial
            </span>
          </div>
        </div>

        <p className="relative text-[13px] text-noche-texto">Región Metropolitana · Duoc UC</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-10">
        <div className="w-full max-w-md">
          {/* En móvil no hay panel, así que la marca entra acá. */}
          <Link
            to="/"
            className="mb-10 inline-block rounded-chico focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primario lg:hidden"
          >
            <LogoLocalCL claseTexto="text-2xl font-bold tracking-[-0.5px] text-noche" />
          </Link>

          {sobretitulo && (
            <p className="text-sm font-bold tracking-[1.2px] text-primario uppercase">{sobretitulo}</p>
          )}

          <h1 className="mt-2 font-titulos text-[2rem] leading-[1.1] font-bold tracking-[-1px] text-noche sm:text-display">
            {titulo}
          </h1>

          {intro && <p className="mt-3 text-base leading-relaxed text-texto-suave">{intro}</p>}

          {children}
        </div>
      </main>
    </div>
  );
}
