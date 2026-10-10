import { clasesControl, MensajeCampo, mensajeVisible, type Mensajes } from "./MensajeCampo";

interface Props extends Mensajes {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar(valor: string): void;
  minimo: number;
  maximo: number;
}

/**
 * Texto largo con contador de caracteres.
 *
 * El contador cuenta lo mismo que la API: el texto sin espacios al inicio ni
 * al final. Si contara los espacios, alguien podría ver "20 / 1000" y recibir
 * igual el error de mínimo.
 *
 * No usa maxLength: cortar en seco lo que se pega sorprende más que un aviso.
 * Se deja escribir de más y el contador se pone en rojo.
 */
export function CampoAreaTexto({ id, etiqueta, valor, alCambiar, minimo, maximo, ...mensajes }: Props) {
  const idMensaje = `${id}-mensaje`;
  const idContador = `${id}-contador`;
  const largo = valor.trim().length;
  const fueraDeRango = largo > maximo || (largo > 0 && largo < minimo);

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-bold text-noche">
        {etiqueta}
      </label>
      <textarea
        id={id}
        name={id}
        rows={5}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={mensajes.error ? true : undefined}
        aria-describedby={[mensajeVisible(mensajes) ? idMensaje : null, idContador].filter(Boolean).join(" ")}
        className={`mt-1.5 block min-h-32 resize-y py-3 leading-relaxed ${clasesControl(mensajes)}`}
      />
      <MensajeCampo
        id={idMensaje}
        mensajes={mensajes}
        extra={
          <p
            id={idContador}
            className={`shrink-0 text-sm tabular-nums ${fueraDeRango ? "font-medium text-error-700" : "text-texto-suave"}`}
          >
            {largo} / {maximo}
          </p>
        }
      />
    </div>
  );
}
