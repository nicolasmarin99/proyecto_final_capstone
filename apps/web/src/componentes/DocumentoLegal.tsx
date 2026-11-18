import type { ReactNode } from "react";

/**
 * Dibuja el texto de los términos tal como lo guarda la API: «# » título,
 * «## » parte, «### » sección, «- » viñeta y párrafos separados por una
 * línea en blanco. «## Título {#id}» deja un ancla (por ejemplo #privacidad).
 *
 * Solo arma elementos de React con texto: nunca HTML crudo, así un texto
 * mal escrito en la base no puede inyectar nada en la página.
 */
export function DocumentoLegal({ contenido, nivelTitulo = 1 }: { contenido: string; nivelTitulo?: 1 | 2 }) {
  const bloques = contenido.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const elementos: ReactNode[] = [];

  bloques.forEach((bloque, indice) => {
    const lineas = bloque.split("\n").filter((linea) => linea.trim() !== "");
    const [primera] = lineas;
    if (!primera) return;

    const encabezado = /^(#{1,3}) (.*?)(?: \{#([a-z0-9-]+)\})?$/.exec(primera);
    if (encabezado && lineas.length === 1) {
      const [, marcas = "#", texto, id] = encabezado;
      // En la página de aceptación el documento va dentro de otra página: sus títulos bajan un nivel.
      const nivel = Math.min(marcas.length + nivelTitulo - 1, 4);
      // El aspecto lo da la marca («#», «##», «###»), no el nivel HTML: dentro
      // de otra página el título baja a h2 pero sigue viéndose como título.
      const clases =
        marcas.length === 1
          ? nivelTitulo === 1
            ? "font-titulos text-titulo font-bold tracking-[-0.5px] text-noche"
            : "font-titulos text-xl font-bold text-noche"
          : marcas.length === 2
            ? "mt-10 scroll-mt-6 border-t border-borde pt-8 font-titulos text-xl font-bold text-noche"
            : "mt-7 scroll-mt-6 font-titulos text-base font-bold text-noche";
      const Etiqueta = (["h1", "h2", "h3", "h4"] as const)[nivel - 1] ?? "h4";
      elementos.push(
        <Etiqueta key={indice} id={id} className={clases}>
          {texto}
        </Etiqueta>,
      );
      return;
    }

    if (lineas.every((linea) => linea.startsWith("- "))) {
      elementos.push(
        <ul key={indice} className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-noche">
          {lineas.map((linea) => (
            <li key={linea}>{linea.slice(2)}</li>
          ))}
        </ul>,
      );
      return;
    }

    elementos.push(
      <p key={indice} className="mt-3 text-[15px] leading-relaxed text-noche">
        {lineas.join(" ")}
      </p>,
    );
  });

  return <>{elementos}</>;
}
