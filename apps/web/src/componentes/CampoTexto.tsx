interface Props {
  id: string;
  etiqueta: string;
  tipo?: "text" | "email" | "password";
  autoComplete: string;
  valor: string;
  alCambiar(valor: string): void;
  error?: string;
}

/**
 * Campo con etiqueta asociada por htmlFor/id, que es lo que permite a un
 * lector de pantalla anunciarlo y lo que hace que getByLabelText lo encuentre.
 * El error se enlaza con aria-describedby y marca el campo con aria-invalid.
 */
export function CampoTexto({
  id,
  etiqueta,
  tipo = "text",
  autoComplete,
  valor,
  alCambiar,
  error,
}: Props) {
  const idError = `${id}-error`;

  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type={tipo}
        autoComplete={autoComplete}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
          error
            ? "border-red-400 focus:ring-red-200"
            : "border-slate-300 focus:border-slate-400 focus:ring-slate-200"
        }`}
      />
      {error && (
        <p id={idError} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
