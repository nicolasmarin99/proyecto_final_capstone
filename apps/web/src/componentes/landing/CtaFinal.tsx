import { Link } from "react-router";
import { Contenedor } from "./Contenedor";

// Sobre fondo noche el anillo de foco azul no se vería: va en blanco.
const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blanco";

/**
 * Llamado final sobre fondo noche. "Buscar un servicio" sube al buscador del
 * hero en vez de ir a otra página: ahí es donde se busca.
 */
export function CtaFinal() {
  return (
    <section className="bg-noche">
      <Contenedor className="flex flex-col items-center gap-6 pt-20 pb-16 text-center md:pt-28 md:pb-24">
        <h2 className="max-w-[820px] font-titulos text-[32px] leading-[1.12] font-bold tracking-[-1px] text-blanco md:text-5xl">
          El servicio que necesitas, a una búsqueda de distancia.
        </h2>
        <p className="max-w-[620px] text-lg leading-[1.55] text-noche-texto md:text-[19px]">
          Únete a LocalCL como cliente o como prestador.
        </p>
        <div className="mt-2 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <a
            href="/#buscar"
            className={`flex h-[54px] items-center justify-center rounded-boton bg-blanco px-[30px] text-[17px] font-bold text-noche transition-colors hover:bg-hielo ${foco}`}
          >
            Buscar un servicio
          </a>
          <Link
            to="/registro-prestador"
            className={`flex h-[54px] items-center justify-center rounded-boton border border-noche-contorno px-[30px] text-[17px] font-bold text-blanco transition-colors hover:bg-noche-borde ${foco}`}
          >
            Publicar mi servicio
          </Link>
        </div>
      </Contenedor>
    </section>
  );
}
