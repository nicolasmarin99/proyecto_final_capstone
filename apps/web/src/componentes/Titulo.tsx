import { createContext, createElement, useContext, type HTMLAttributes, type ReactNode } from "react";

/*
  Las colas del panel de administración se usan de dos formas: como sección
  propia de la página (su título es un h2) y desplegadas DENTRO de un
  prestador (cuyo nombre ya es un h3). Para que el esquema de títulos no se
  salte niveles en ningún caso, cada cola no escribe «h2» o «h3» a mano: usa
  <Titulo>, que parte del nivel que le fija quien la contiene.
*/

const NivelBase = createContext(2);

/** Fija el nivel del título de sección para todo lo que contiene (2 = h2, 4 = h4…). */
export function ConNivelDeTitulo({ nivel, children }: { nivel: number; children: ReactNode }) {
  return <NivelBase.Provider value={nivel}>{children}</NivelBase.Provider>;
}

/**
 * Un título relativo al contenedor: `profundidad` 0 es el título de la
 * sección; 1, el de cada elemento dentro de ella; 2, el de sus partes.
 */
export function Titulo({ profundidad = 0, ...atributos }: { profundidad?: 0 | 1 | 2 } & HTMLAttributes<HTMLHeadingElement>) {
  const nivel = Math.min(6, useContext(NivelBase) + profundidad);
  return createElement(`h${nivel}`, atributos);
}
