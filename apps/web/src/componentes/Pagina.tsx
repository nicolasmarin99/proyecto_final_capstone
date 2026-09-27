import type { ReactNode } from "react";
import { Marca } from "./Marca";

/**
 * Tarjeta centrada para las pantallas de dentro de la aplicación: estado,
 * perfil y panel de administración. A diferencia de PaginaAuth no lleva panel
 * de marca, porque quien llega acá ya sabe dónde está y lo que necesita es
 * su contenido, no que le expliquen el producto.
 */
export function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-marca-50 p-6">
      <div className="w-full max-w-md rounded-tarjeta border border-piedra-100 bg-white p-8 shadow-sm">
        <Marca />
        <h1 className="mt-5 font-display text-titulo font-semibold tracking-tight text-marca-900">
          {titulo}
        </h1>
        {children}
      </div>
    </main>
  );
}
