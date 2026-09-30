import { useEffect, useState } from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";

/**
 * Indica si el sistema pide reducir el movimiento.
 *
 * Para las animaciones CSS basta con motion-safe: en las clases. Este hook
 * existe para lo que CSS no alcanza a controlar, como el autoplay del video.
 * Se mantiene al día si la persona cambia la preferencia con la página abierta.
 */
export function usePrefiereMenosMovimiento(): boolean {
  const [reducir, setReducir] = useState(() => consultar()?.matches ?? false);

  useEffect(() => {
    const consulta = consultar();
    if (!consulta) return;
    const alCambiar = () => setReducir(consulta.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  return reducir;
}

// matchMedia no existe en jsdom (las pruebas) ni en navegadores muy antiguos.
function consultar(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(CONSULTA) : null;
}
