import type { ReactNode } from "react";

/**
 * Íconos de trazo de LocalCL. Todos comparten la misma grilla de 24×24 y
 * el mismo grosor, y toman el color del texto (currentColor): así el
 * componente que los usa decide el color con una clase, sin tocar el SVG.
 *
 * Son decorativos: siempre acompañan a un texto que ya dice lo mismo.
 */
const trazos = {
  gota: <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />,
  rayo: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  bandeja: (
    <>
      <path d="M3 18h18" />
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 11V8" />
      <path d="M10 8h4" />
    </>
  ),
  llama: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .5 2 1.5 3 2.5 3 0-3-1-5 0-8z" />,
  martillo: (
    <>
      <path d="M15 4l5 5" />
      <path d="M12 7l5 5-9 9-5-5z" />
    </>
  ),
  llave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9" />
      <path d="M17 6l3 3" />
    </>
  ),
  persona: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  mensaje: <path d="M4 5h16v11H9l-5 4z" />,
  lupa: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  ubicacion: (
    <>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  flechaAbajo: (
    <>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  ojo: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ojoTachado: (
    <>
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  visto: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof trazos;

export function Icono({
  nombre,
  tamano = 24,
  grosor = 1.8,
  className,
}: {
  nombre: NombreIcono;
  tamano?: number;
  grosor?: number;
  className?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {trazos[nombre]}
    </svg>
  );
}
