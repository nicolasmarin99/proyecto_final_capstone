import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  variante?: "principal" | "secundario";
};

/**
 * Botón de formulario con los mismos estilos que los botones de la landing:
 * el principal en azul primario (6.7:1 con el texto blanco) y el secundario
 * con contorno. Al pasar el mouse el principal se oscurece a noche.
 *
 * Alto mínimo de 48px para que sea un objetivo táctil cómodo.
 */
export function Boton({ variante = "principal", className = "", ...resto }: Props) {
  return <button className={`${clasesBoton(variante)} w-full cursor-pointer ${className}`} {...resto} />;
}

/**
 * Las mismas clases, para los enlaces que se ven como botón (por ejemplo
 * "Ir a iniciar sesión"). Un enlace que navega tiene que ser <a>, no
 * <button>, aunque se vea igual: así se puede abrir en otra pestaña y el
 * lector de pantalla lo anuncia como enlace.
 */
export function clasesBoton(variante: "principal" | "secundario" = "principal"): string {
  const base =
    "flex min-h-12 items-center justify-center rounded-boton px-4 text-[15px] font-bold transition-colors " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  return variante === "principal"
    ? `${base} bg-primario text-blanco hover:bg-noche disabled:hover:bg-primario`
    : `${base} border border-borde-fuerte bg-blanco text-primario hover:bg-hielo`;
}
