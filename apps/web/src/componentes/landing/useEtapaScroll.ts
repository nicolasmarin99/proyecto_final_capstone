import { useCallback, useEffect, useState, type RefObject } from "react";

export type Etapa = 0 | 1 | 2;

/**
 * Qué tan avanzado va el scroll dentro de la sección, de 0 a 1.
 *
 * La parte fija (sticky) mide `altoFijo` y la sección completa `altoSeccion`,
 * así que el recorrido real es la diferencia: cuando la sección subió todo
 * eso, el contenido fijo está por soltarse y el progreso vale 1.
 * `topSeccion` es negativo a medida que la sección se va por arriba.
 */
export function calcularProgreso(topSeccion: number, altoSeccion: number, altoFijo: number): number {
  const recorrido = Math.max(1, altoSeccion - altoFijo);
  return Math.min(1, Math.max(0, -topSeccion / recorrido));
}

/** Umbrales del diseño: tres categorías, tres más, y al final el logo. */
export function calcularEtapa(progreso: number): Etapa {
  if (progreso < 0.34) return 0;
  if (progreso < 0.72) return 1;
  return 2;
}

/** Punto medio de cada etapa, a donde se lleva el scroll al enfocar con teclado. */
const CENTRO_ETAPA: Record<Etapa, number> = { 0: 0.17, 1: 0.53, 2: 0.86 };

/**
 * Etapa de la sección de categorías según el scroll.
 *
 * Se mide con getBoundingClientRect() en cada scroll, pero dentro de
 * requestAnimationFrame: el navegador puede disparar decenas de eventos de
 * scroll por cuadro, y medir el DOM en cada uno es trabajo tirado. Así se
 * mide a lo más una vez por cuadro. setEtapa con el mismo valor no vuelve a
 * renderizar, así que React solo trabaja cuando la etapa cambia de verdad.
 *
 * @param seccion la sección alta (2400px) que se recorre.
 * @param fijo    el bloque sticky de su interior.
 */
export function useEtapaScroll(seccion: RefObject<HTMLElement | null>, fijo: RefObject<HTMLElement | null>) {
  const [etapa, setEtapa] = useState<Etapa>(0);

  useEffect(() => {
    let cuadro = 0;

    const medir = () => {
      cuadro = 0;
      if (!seccion.current || !fijo.current) return;
      const caja = seccion.current.getBoundingClientRect();
      setEtapa(calcularEtapa(calcularProgreso(caja.top, caja.height, fijo.current.offsetHeight)));
    };

    const programar = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", programar, { passive: true });
    window.addEventListener("resize", programar);
    return () => {
      window.removeEventListener("scroll", programar);
      window.removeEventListener("resize", programar);
      cancelAnimationFrame(cuadro);
    };
  }, [seccion, fijo]);

  /**
   * Lleva el scroll hasta una etapa. Lo usa el foco del teclado: si alguien
   * llega con Tab a una tarjeta de la etapa 1 mientras se ve la 0, la tarjeta
   * enfocada estaría invisible. Mover el scroll hace que aparezca.
   */
  const irAEtapa = useCallback(
    (destino: Etapa) => {
      if (!seccion.current || !fijo.current) return;
      const caja = seccion.current.getBoundingClientRect();
      const recorrido = Math.max(1, caja.height - fijo.current.offsetHeight);
      const inicio = window.scrollY + caja.top;
      window.scrollTo({ top: inicio + CENTRO_ETAPA[destino] * recorrido, behavior: "instant" });
    },
    [seccion, fijo],
  );

  return { etapa, irAEtapa };
}
