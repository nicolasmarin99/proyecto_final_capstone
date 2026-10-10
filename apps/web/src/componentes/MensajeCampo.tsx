import type { ReactNode } from "react";
import { Icono } from "./iconos";

/**
 * Piezas comunes de los campos de formulario (CampoTexto, CampoAreaTexto,
 * SelectorComuna), para que todos se vean y se anuncien igual.
 */

export interface Mensajes {
  error?: string;
  ayuda?: string;
  /** Confirmación en vivo, en verde. */
  valido?: string;
}

/** El mensaje que corresponde mostrar: el error, la confirmación o la ayuda, en ese orden. */
export function mensajeVisible({ error, ayuda, valido }: Mensajes) {
  if (error) return { tipo: "error" as const, texto: error };
  if (valido) return { tipo: "valido" as const, texto: valido };
  if (ayuda) return { tipo: "ayuda" as const, texto: ayuda };
  return null;
}

/** Clases del control (input, textarea, select): fondo propio, borde según el estado. */
export function clasesControl({ error, valido }: Mensajes): string {
  const estado = error
    ? "border-error-700 focus:border-error-700 focus:ring-error-700/15"
    : valido
      ? "border-exito-700/60 focus:border-exito-700 focus:ring-exito-700/15"
      : "border-borde-fuerte focus:border-primario focus:ring-primario/15";

  return (
    "w-full rounded-chico border bg-niebla px-4 text-base text-noche outline-none " +
    "transition-[background-color,border-color,box-shadow] duration-200 " +
    `placeholder:text-texto-tenue focus:bg-blanco focus:ring-4 ${estado}`
  );
}

/**
 * Mensaje bajo el campo. El contenedor es una región aria-live: el lector de
 * pantalla anuncia cuando cambia, sin que la persona tenga que ir a buscarlo.
 * `extra` se muestra a la derecha en la misma línea (p. ej. un contador).
 */
export function MensajeCampo({ id, mensajes, extra }: { id: string; mensajes: Mensajes; extra?: ReactNode }) {
  const mensaje = mensajeVisible(mensajes);

  return (
    <div className="mt-1.5 flex items-start justify-between gap-3">
      <div aria-live="polite" className="min-w-0">
        {mensaje && (
          <p
            // La key cambia con el tipo de mensaje: React crea un elemento
            // nuevo y la animación de entrada vuelve a correr.
            key={mensaje.tipo}
            id={id}
            className={`flex items-start gap-1.5 text-sm motion-safe:animate-aparecer-corto ${
              mensaje.tipo === "error"
                ? "font-medium text-error-700"
                : mensaje.tipo === "valido"
                  ? "font-medium text-exito-700"
                  : "text-texto-suave"
            }`}
          >
            {mensaje.tipo === "valido" && <Icono nombre="visto" tamano={18} grosor={2.2} className="shrink-0" />}
            {mensaje.texto}
          </p>
        )}
      </div>
      {extra}
    </div>
  );
}
