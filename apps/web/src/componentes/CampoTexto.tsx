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
      <label htmlFor={id} className="block text-sm font-bold text-noche">
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
        className={`mt-1.5 h-12 w-full rounded-chico border bg-niebla px-4 text-base text-noche transition outline-none placeholder:text-texto-tenue focus:bg-blanco focus:ring-4 ${
          error
            ? "border-error-700 focus:border-error-700 focus:ring-error-700/15"
            : "border-borde-fuerte focus:border-primario focus:ring-primario/15"
        }`}
      />
      {ayuda && !error && (
        <p id={idAyuda} className="mt-1.5 text-sm text-texto-suave">
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
