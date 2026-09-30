interface Props {
  /** "principal" sobre fondos claros; "invertido" sobre el azul noche. */
  variante?: "principal" | "invertido";
  /** Lado del ícono en píxeles. */
  tamano?: number;
  /** Clases para el nombre; sin ellas se muestra solo el ícono. */
  claseTexto?: string;
}

/**
 * Logo de la marca nueva: una lupa con un destello, porque lo primero que se
 * hace en LocalCL es buscar. Reemplazará a Marca cuando el resto de la
 * aplicación se migre.
 *
 * El SVG es decorativo (aria-hidden): el nombre "LocalCL" va como texto al
 * lado, y es lo que lee un lector de pantalla.
 */
export function LogoLocalCL({ variante = "principal", tamano = 40, claseTexto }: Props) {
  const invertido = variante === "invertido";

  return (
    <span className="flex items-center gap-3">
      <svg width={tamano} height={tamano} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <rect width="48" height="48" rx="12" className={invertido ? "fill-blanco" : "fill-primario"} />
        <g className={invertido ? "stroke-primario" : "stroke-blanco"} fill="none">
          <circle cx="21" cy="21" r="9" strokeWidth="4" />
          <path d="M28 28l8 8" strokeWidth="4.5" strokeLinecap="round" />
        </g>
        <path
          d="M21 15.5l1.6 3.9 3.9 1.6-3.9 1.6-1.6 3.9-1.6-3.9-3.9-1.6 3.9-1.6z"
          className={invertido ? "fill-cielo" : "fill-estrella"}
        />
      </svg>
      {claseTexto && <span className={`font-titulos ${claseTexto}`}>LocalCL</span>}
    </span>
  );
}
