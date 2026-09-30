import { useState } from "react";
import { Icono } from "./iconos";

interface Props {
  id: string;
  etiqueta: string;
  tipo?: "text" | "email" | "password";
  autoComplete: string;
  valor: string;
  alCambiar(valor: string): void;
  error?: string;
  ayuda?: string;
  /** Confirmación en vivo ("Las contraseñas coinciden."). Se muestra en verde. */
  valido?: string;
}

/**
 * Campo con etiqueta asociada por htmlFor/id, que es lo que permite a un
 * lector de pantalla anunciarlo y lo que hace que getByLabelText lo encuentre.
 * El error se enlaza con aria-describedby y marca el campo con aria-invalid.
 *
 * El campo tiene fondo propio y no solo borde: un contorno sobre blanco se lee
 * como decoración, un área con relleno se lee como un lugar donde escribir.
 *
 * Bajo el campo se muestra un solo mensaje, en este orden: el error, la
 * confirmación o la ayuda. Ese espacio es una región aria-live, así que el
 * lector de pantalla anuncia cuando cambia (por ejemplo, cuando la contraseña
 * repetida empieza a coincidir) sin que la persona tenga que ir a buscarlo.
 */
export function CampoTexto({
  id,
  etiqueta,
  tipo = "text",
  autoComplete,
  valor,
  alCambiar,
  error,
  ayuda,
  valido,
}: Props) {
  const [visible, setVisible] = useState(false);
  const esContrasena = tipo === "password";

  const idMensaje = `${id}-mensaje`;
  const mensaje = error
    ? { tipo: "error" as const, texto: error }
    : valido
      ? { tipo: "valido" as const, texto: valido }
      : ayuda
        ? { tipo: "ayuda" as const, texto: ayuda }
        : null;

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-bold text-noche">
        {etiqueta}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={id}
          type={esContrasena && visible ? "text" : tipo}
          autoComplete={autoComplete}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={mensaje ? idMensaje : undefined}
          className={`h-12 w-full rounded-chico border bg-niebla px-4 text-base text-noche transition-[background-color,border-color,box-shadow] duration-200 outline-none placeholder:text-texto-tenue focus:bg-blanco focus:ring-4 ${
            esContrasena ? "pr-12" : ""
          } ${
            error
              ? "border-error-700 focus:border-error-700 focus:ring-error-700/15"
              : valido
                ? "border-exito-700/60 focus:border-exito-700 focus:ring-exito-700/15"
                : "border-borde-fuerte focus:border-primario focus:ring-primario/15"
          }`}
        />
        {esContrasena && (
          // El nombre va como texto oculto dentro del botón y no en
          // aria-label: así getByLabelText("Contraseña") sigue encontrando
          // solo el campo, y el lector de pantalla lee "Mostrar contraseña".
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-chico text-texto-suave transition-colors hover:text-primario focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primario"
          >
            <Icono nombre={visible ? "ojoTachado" : "ojo"} tamano={20} />
            <span className="sr-only">{visible ? "Ocultar contraseña" : "Mostrar contraseña"}</span>
          </button>
        )}
      </div>

      <div aria-live="polite">
        {mensaje && (
          <p
            // La key cambia con el tipo de mensaje: React crea un elemento
            // nuevo y la animación de entrada vuelve a correr.
            key={mensaje.tipo}
            id={idMensaje}
            className={`mt-1.5 flex items-start gap-1.5 text-sm motion-safe:animate-aparecer-corto ${
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
    </div>
  );
}
