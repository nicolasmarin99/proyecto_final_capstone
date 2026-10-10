import { useState } from "react";
import { Icono } from "./iconos";
import { clasesControl, MensajeCampo, mensajeVisible } from "./MensajeCampo";

interface Props {
  id: string;
  etiqueta: string;
  tipo?: "text" | "email" | "password" | "tel" | "number";
  autoComplete: string;
  valor: string;
  alCambiar(valor: string): void;
  error?: string;
  ayuda?: string;
  /** Confirmación en vivo ("Las contraseñas coinciden."). Se muestra en verde. */
  valido?: string;
  /** Teclado en pantalla del móvil: "numeric" para números, "tel" para teléfonos. */
  inputMode?: "numeric" | "tel";
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
 * confirmación o la ayuda (ver MensajeCampo), y se anuncia cuando cambia.
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
  inputMode,
}: Props) {
  const [visible, setVisible] = useState(false);
  const esContrasena = tipo === "password";

  const idMensaje = `${id}-mensaje`;
  const mensajes = { error, ayuda, valido };

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
          inputMode={inputMode}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={mensajeVisible(mensajes) ? idMensaje : undefined}
          className={`h-12 ${esContrasena ? "pr-12" : ""} ${clasesControl(mensajes)}`}
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

      <MensajeCampo id={idMensaje} mensajes={mensajes} />
    </div>
  );
}
