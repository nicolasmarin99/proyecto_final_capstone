import type { ReactNode } from "react";
import { Marca } from "./Marca";

interface Props {
  sobretitulo?: string;
  titulo: string;
  intro?: string;
  children: ReactNode;
}

/**
 * Pantalla partida para registro e inicio de sesión.
 *
 * El panel izquierdo existe porque estas son las únicas pantallas que ve
 * alguien que todavía no sabe qué es LocalCL: es el momento de explicar por
 * qué esta plataforma no es una lista de contactos más. Desaparece bajo lg,
 * donde el espacio es del formulario y el mensaje se reduce a la marca.
 */
export function PaginaAuth({ sobretitulo, titulo, intro, children }: Props) {
  return (
    // Grid y no flex: las pistas de Tailwind son minmax(0,1fr), así que la
    // columna nunca hereda el piso de min-content que arrastra un hijo flex.
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-marca-900 p-12 lg:flex">
        <Marca tono="claro" />

        <div>
          <h2 className="font-display text-[2.6rem] leading-[1.12] font-semibold tracking-tight text-white">
            Contrata con respaldo,
            <br />
            no con suerte.
          </h2>

          <p className="mt-5 max-w-sm text-base leading-relaxed text-marca-200">
            Cada prestador acredita sus certificados contra registros oficiales antes de aparecer
            en la plataforma.
          </p>

          <div className="mt-8 flex items-center gap-3 rounded-r-lg border-l-[3px] border-acento-400 bg-acento-400/10 px-4 py-3.5">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-acento-400"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
            <span className="text-sm font-medium text-acento-100">
              Credenciales contrastadas con el registro oficial
            </span>
          </div>
        </div>

        <p className="text-[13px] text-marca-200/70">Región Metropolitana · Duoc UC</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          {/* En móvil no hay panel, así que la marca entra acá. */}
          <div className="mb-8 lg:hidden">
            <Marca />
          </div>

          {sobretitulo && (
            <p className="text-sm font-medium text-acento-600">{sobretitulo}</p>
          )}

          <h1 className="mt-1.5 font-display text-display font-semibold tracking-tight text-marca-900">
            {titulo}
          </h1>

          {intro && <p className="mt-2 text-[15px] leading-relaxed text-piedra-500">{intro}</p>}

          {children}
        </div>
      </main>
    </div>
  );
}
