import type { ReactNode } from "react";

/**
 * Tarjeta centrada para las pantallas de dentro de la aplicación: estado,
 * perfil y panel de administración. A diferencia de PaginaAuth no lleva panel
 * de marca, porque quien llega acá ya sabe dónde está y lo que necesita es
 * su contenido, no que le expliquen el producto.
 *
 * El fondo es la malla de puntos de la landing, quieta: acá acompaña, no
 * tiene que llamar la atención.
 */
export function Pagina({
  titulo,
  children,
  ancho = "normal",
}: {
  titulo: string;
  children: ReactNode;
  /** "amplio" para contenido que no cabe en una columna angosta, como la cola de revisión. */
  ancho?: "normal" | "amplio";
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-niebla bg-[radial-gradient(var(--color-malla)_1.4px,transparent_1.6px)] bg-size-[28px_28px] px-4 py-10 sm:p-6">
      <div className={`w-full ${ancho === "amplio" ? "max-w-3xl" : "max-w-md"} motion-safe:animate-aparecer rounded-grande border border-borde bg-blanco p-6 shadow-tarjeta sm:p-8`}>
        <h1 className="font-titulos text-titulo font-bold tracking-[-0.5px] text-noche">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
