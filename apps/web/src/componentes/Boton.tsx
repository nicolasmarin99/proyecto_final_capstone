import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  variante?: "principal" | "secundario";
};

/**
 * El botón principal va en ámbar sobre texto azul oscuro. Es el único lugar
 * de la interfaz donde el ámbar ocupa un área grande, y por eso el ojo lo
 * encuentra sin buscarlo.
 *
 * Alto mínimo de 48px para que sea un objetivo táctil cómodo.
 */
export function Boton({ variante = "principal", className = "", ...resto }: Props) {
  const base =
    "w-full min-h-12 rounded-campo px-4 text-[15px] font-semibold transition " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-500 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const estilos =
    variante === "principal"
      ? "bg-acento-400 text-marca-950 hover:bg-[#d9a52f]"
      : "border border-piedra-300 bg-white text-marca-900 hover:bg-piedra-50";

  return <button className={`${base} ${estilos} ${className}`} {...resto} />;
}
