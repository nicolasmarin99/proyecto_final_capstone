import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  variante?: "principal" | "secundario";
  /** Petición en curso: deshabilita el botón y muestra un indicador girando. */
  cargando?: boolean;
};

/**
 * Botón de formulario con los mismos estilos que los botones de la landing:
 * el principal en azul primario (6.7:1 con el texto blanco) y el secundario
 * con contorno. Al pasar el mouse el principal se oscurece a noche.
 *
 * Alto mínimo de 48px para que sea un objetivo táctil cómodo.
 */
export function Boton({ variante = "principal", cargando = false, className = "", disabled, children, ...resto }: Props) {
  return (
    <button
      className={`${clasesBoton(variante)} w-full cursor-pointer gap-2.5 ${className}`}
      disabled={disabled || cargando}
      // aria-busy le dice al lector de pantalla que algo está en curso; el
      // texto del botón ("Entrando…") dice qué.
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando && <Indicador />}
      {children}
    </button>
  );
}

/**
 * Anillo que gira. Es el único movimiento continuo de la aplicación, y está
 * bien que lo sea: mientras gira, algo está pasando. Con "reducir movimiento"
 * queda quieto; el texto del botón ya dice que se está cargando.
 */
function Indicador() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 motion-safe:animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Las mismas clases, para los enlaces que se ven como botón (por ejemplo
 * "Ir a iniciar sesión"). Un enlace que navega tiene que ser <a>, no
 * <button>, aunque se vea igual: así se puede abrir en otra pestaña y el
 * lector de pantalla lo anuncia como enlace.
 */
export function clasesBoton(variante: "principal" | "secundario" = "principal"): string {
  // active:scale: el botón "se hunde" al presionarlo. Es un cambio de 2%,
  // con transform, así que no mueve nada alrededor.
  const base =
    "flex min-h-12 items-center justify-center rounded-boton px-4 text-[15px] font-bold " +
    "transition-[color,background-color,border-color,transform] duration-200 motion-safe:active:scale-[0.98] " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario " +
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

  return variante === "principal"
    ? `${base} bg-primario text-blanco hover:bg-noche disabled:hover:bg-primario`
    : `${base} border border-borde-fuerte bg-blanco text-primario hover:bg-hielo`;
}
