import { useEffect, useRef, useState, type ReactNode } from "react";

type Estado = "sin-observar" | "pendiente" | "visible";

/**
 * Hace aparecer su contenido con un deslizamiento suave la primera vez que
 * entra en pantalla.
 *
 * El estado vive en el atributo data-revelar y el CSS (index.css) decide qué
 * hacer con él. Así el contenido solo se oculta si se cumplen las dos cosas:
 * el navegador tiene IntersectionObserver y la persona no pidió reducir el
 * movimiento. En cualquier otro caso se ve de inmediato: una animación nunca
 * puede ser la razón de que alguien no vea un texto.
 *
 * `retraso` (en ms) escalona elementos de una misma fila, como las tarjetas
 * de pasos, para que entren uno tras otro y no en bloque.
 */
export function Revelar({
  children,
  retraso = 0,
  className = "",
  como: Etiqueta = "div",
}: {
  children: ReactNode;
  retraso?: number;
  className?: string;
  como?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [estado, setEstado] = useState<Estado>("sin-observar");

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || typeof IntersectionObserver !== "function") return;

    setEstado("pendiente");
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          setEstado("visible");
          // Aparece una sola vez: volver a esconderlo al salir de pantalla
          // haría que el contenido "parpadee" al subir y bajar.
          observador.disconnect();
        }
      },
      // Se dispara un poco antes de que el borde inferior lo alcance, así la
      // animación ya empezó cuando la vista llega a él.
      { rootMargin: "0px 0px -10% 0px" },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <Etiqueta
      // El ref genérico no calza con la unión div | li; es el mismo nodo DOM.
      ref={ref as never}
      data-revelar={estado === "sin-observar" ? undefined : estado}
      className={className}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </Etiqueta>
  );
}
