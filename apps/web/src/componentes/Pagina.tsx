import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogoLocalCL } from "./LogoLocalCL";

/**
 * Tarjeta centrada para las pantallas de dentro de la aplicación: estado,
 * perfil y panel de administración. A diferencia de PaginaAuth no lleva panel
 * de marca, porque quien llega acá ya sabe dónde está y lo que necesita es
 * su contenido, no que le expliquen el producto.
 *
 * El fondo es la malla de puntos de la landing, quieta: acá acompaña, no
 * tiene que llamar la atención.
 */
export function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-niebla bg-[radial-gradient(var(--color-malla)_1.4px,transparent_1.6px)] bg-size-[28px_28px] px-4 py-10 sm:p-6">
      <div className="w-full max-w-md rounded-grande border border-borde bg-blanco p-6 shadow-tarjeta sm:p-8">
        <Link
          to="/"
          className="inline-block rounded-chico focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primario"
        >
          <LogoLocalCL tamano={36} claseTexto="text-xl font-bold tracking-[-0.5px] text-noche" />
        </Link>
        <h1 className="mt-6 font-titulos text-titulo font-bold tracking-[-0.5px] text-noche">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
