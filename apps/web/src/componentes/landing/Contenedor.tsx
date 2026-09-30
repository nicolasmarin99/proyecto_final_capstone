import type { ReactNode } from "react";

/**
 * Ancho máximo y márgenes laterales de todas las secciones de la landing.
 * El diseño usa 96px a los lados en 1440px; en pantallas chicas eso se come
 * el contenido, así que baja a 40px en tablet y a 16px en teléfono.
 */
export function Contenedor({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-4 md:px-10 xl:px-24 ${className}`}>{children}</div>;
}

/** Sobretítulo en mayúsculas que encabeza cada sección ("Categorías", "Cómo funciona"...). */
export function Sobretitulo({ children }: { children: ReactNode }) {
  return <p className="text-sm font-bold tracking-[1.2px] text-primario uppercase">{children}</p>;
}
