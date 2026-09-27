interface Props {
  id: string;
  etiqueta: string;
  tipo?: "text" | "email" | "password";
  autoComplete: string;
  valor: string;
  alCambiar(valor: string): void;
  error?: string;
  ayuda?: string;
}

/**
 * Campo con etiqueta asociada por htmlFor/id, que es lo que permite a un
 * lector de pantalla anunciarlo y lo que hace que getByLabelText lo encuentre.
 * El error se enlaza con aria-describedby y marca el campo con aria-invalid.
 *
 * El campo tiene fondo propio y no solo borde: un contorno sobre blanco se lee
 * como decoración, un área con relleno se lee como un lugar donde escribir.
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
}: Props) {
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descripcion = [error ? idError : null, ayuda ? idAyuda : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-medium text-piedra-700">
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
        aria-describedby={descripcion || undefined}
        className={`mt-1.5 h-12 w-full rounded-campo border bg-piedra-50 px-4 text-[15px] text-marca-900 transition outline-none placeholder:text-piedra-300 focus:bg-white focus:ring-2 ${
          error
            ? "border-error-700 focus:border-error-700 focus:ring-error-700/20"
            : "border-piedra-300 focus:border-marca-500 focus:ring-marca-500/25"
        }`}
      />
      {ayuda && !error && (
        <p id={idAyuda} className="mt-1.5 text-sm text-piedra-500">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="mt-1.5 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
    </div>
  );
}
