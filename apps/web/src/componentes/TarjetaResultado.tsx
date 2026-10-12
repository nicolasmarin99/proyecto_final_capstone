import { Link } from "react-router";
import type { ResultadoBusqueda } from "../api/cliente";
import { nombreCategoria, textoPrecio } from "../servicios/formato";
import { Icono } from "./iconos";

/** «Las Condes, Ñuñoa, Providencia y 2 más». */
function textoComunas({ comunas, comunasRestantes }: ResultadoBusqueda["prestador"]): string {
  const nombres = comunas.map((comuna) => comuna.nombre).join(", ");
  return comunasRestantes > 0 ? `${nombres} y ${comunasRestantes} más` : nombres;
}

/**
 * Un resultado de la búsqueda. La tarjeta entera es el enlace a la página
 * del servicio: un solo objetivo grande en vez de un botón chico al pie.
 * El nombre accesible del enlace es el título (aria-labelledby): un lector
 * de pantalla no lee la tarjeta entera cada vez que pasa por ella. El
 * precio, el prestador y las comunas quedan como descripción.
 */
export function TarjetaResultado({ resultado }: { resultado: ResultadoBusqueda }) {
  const { prestador } = resultado;

  return (
    <Link
      to={`/servicios/${resultado.id}`}
      aria-labelledby={`titulo-${resultado.id}`}
      aria-describedby={`detalle-${resultado.id}`}
      className="group flex h-full flex-col rounded-medio border border-borde bg-blanco p-5 shadow-tarjeta transition-[border-color,box-shadow,transform] duration-200 hover:border-primario hover:shadow-tarjeta-alta motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-hielo px-2.5 py-1 text-xs font-bold text-primario">{nombreCategoria(resultado)}</span>
        {prestador.acreditado && (
          <span className="flex items-center gap-1 rounded-full bg-exito-50 px-2.5 py-1 text-xs font-semibold text-exito-700">
            <Icono nombre="escudo" tamano={14} grosor={2} />
            Certificación oficial
          </span>
        )}
      </div>

      <h3 id={`titulo-${resultado.id}`} className="mt-3 font-titulos text-lg leading-snug font-bold text-noche group-hover:text-primario">{resultado.titulo}</h3>

      <div id={`detalle-${resultado.id}`} className="mt-auto pt-4">
        <p className="font-bold text-noche">{textoPrecio(resultado)}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-texto-suave">
          <Icono nombre="persona" tamano={16} className="shrink-0 text-primario" />
          {prestador.nombre}
        </p>
        {prestador.comunas.length > 0 && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-texto-suave">
            <Icono nombre="ubicacion" tamano={16} className="mt-0.5 shrink-0 text-primario" />
            <span>Atiende en {textoComunas(prestador)}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
