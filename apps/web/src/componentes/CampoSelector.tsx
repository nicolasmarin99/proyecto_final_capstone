import { clasesControl, MensajeCampo, mensajeVisible } from "./MensajeCampo";

/** Selector nativo con el mismo estilo y mensajes que el resto de los campos. */
export function CampoSelector({
  id,
  etiqueta,
  valor,
  alCambiar,
  opciones,
  vacio,
  error,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar(valor: string): void;
  opciones: { valor: string; texto: string }[];
  vacio: string;
  error?: string;
  ayuda?: string;
}) {
  const idMensaje = `${id}-mensaje`;
  const mensajes = { error, ayuda };

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-bold text-noche">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={mensajeVisible(mensajes) ? idMensaje : undefined}
        className={`mt-1.5 h-12 cursor-pointer ${clasesControl(mensajes)}`}
      >
        <option value="">{vacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      <MensajeCampo id={idMensaje} mensajes={mensajes} />
    </div>
  );
}
