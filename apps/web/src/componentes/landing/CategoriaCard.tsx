import { Link } from "react-router";
import { rutaBusqueda, type Categoria } from "./datos";
import { Icono } from "../iconos";

/**
 * Tarjeta de una categoría. Toda la tarjeta es un enlace: el objetivo táctil
 * es grande y no hay que apuntarle a la frase "Ver prestadores".
 */
export function CategoriaCard({ categoria }: { categoria: Categoria }) {
  return (
    <Link
      to={rutaBusqueda(categoria.nombre)}
      className="group flex flex-col gap-6 rounded-[28px] border border-borde bg-blanco p-7 text-noche shadow-tarjeta transition-[border-color,box-shadow,transform] duration-300 hover:border-borde-fuerte hover:shadow-tarjeta-alta motion-safe:hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario xl:gap-7 xl:p-10"
    >
      <span className="flex size-16 items-center justify-center rounded-[20px] bg-hielo text-primario xl:size-20">
        <Icono nombre={categoria.icono} tamano={36} className="xl:size-10" />
      </span>
      <span className="flex flex-col gap-2.5">
        <span className="font-titulos text-2xl font-bold xl:text-[28px]">{categoria.nombre}</span>
        <span className="text-[17px] leading-[1.55] text-texto-suave">{categoria.descripcion}</span>
      </span>
      <span className="mt-auto font-bold text-primario">
        Ver prestadores{" "}
        <span aria-hidden="true" className="inline-block transition-transform motion-safe:group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
