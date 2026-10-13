import { useId, useState, type KeyboardEvent } from "react";
import type { ImagenPublica } from "../api/cliente";

/**
 * Galería de la página pública: la foto elegida en grande y el resto en
 * miniaturas debajo.
 *
 * - Cada miniatura es un botón: se recorre con Tab y se elige con Enter o
 *   Espacio; las flechas izquierda y derecha pasan a la anterior o la
 *   siguiente. aria-current marca cuál se está viendo.
 * - El texto alternativo describe la foto con lo que se sabe de ella (el
 *   servicio y su posición), porque el prestador no escribe una descripción.
 */
export function GaleriaServicio({ imagenes, titulo, categoria }: { imagenes: ImagenPublica[]; titulo: string; categoria: string }) {
  const [elegida, setElegida] = useState(0);
  const idTitulo = useId();
  const total = imagenes.length;
  const actual = imagenes[elegida] ?? imagenes[0];

  if (!actual) return null;

  const alternativo = (indice: number) => `Trabajo de ${categoria.toLowerCase()} de «${titulo}», foto ${indice + 1} de ${total}`;

  function alTeclear(evento: KeyboardEvent<HTMLUListElement>) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    // Se avanza desde la miniatura que tiene el foco (puede no ser la elegida).
    const botones = [...evento.currentTarget.querySelectorAll("button")];
    const desde = evento.target instanceof HTMLButtonElement ? botones.indexOf(evento.target) : -1;
    const siguiente = ((desde >= 0 ? desde : elegida) + (evento.key === "ArrowRight" ? 1 : -1) + total) % total;
    setElegida(siguiente);
    // El foco acompaña a la foto elegida, para seguir navegando con flechas.
    botones[siguiente]?.focus();
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-6">
      <h2 id={idTitulo} className="sr-only">
        Fotos de trabajos anteriores
      </h2>
      <figure>
        <img
          src={actual.url}
          alt={alternativo(elegida)}
          className="aspect-[4/3] w-full rounded-medio border border-borde bg-niebla object-cover"
        />
        {total > 1 && (
          <figcaption className="mt-2 text-sm text-texto-suave">
            Foto {elegida + 1} de {total}
          </figcaption>
        )}
      </figure>

      {total > 1 && (
        <ul aria-label="Elegir foto" onKeyDown={alTeclear} className="mt-3 grid grid-cols-5 gap-2">
          {imagenes.map((imagen, indice) => (
            <li key={imagen.id}>
              <button
                type="button"
                onClick={() => setElegida(indice)}
                aria-current={indice === elegida ? "true" : undefined}
                aria-label={`Ver foto ${indice + 1} de ${total}`}
                className={`block w-full cursor-pointer overflow-hidden rounded-chico border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario ${
                  indice === elegida ? "border-primario" : "border-transparent hover:border-borde-fuerte"
                }`}
              >
                <img src={imagen.miniatura} alt="" className="aspect-[4/3] w-full bg-niebla object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
