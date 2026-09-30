import { useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { LogoLocalCL } from "../LogoLocalCL";
import { CategoriaCard } from "./CategoriaCard";
import { Contenedor, Sobretitulo } from "./Contenedor";
import { CATEGORIAS, GRUPOS_CATEGORIAS } from "./datos";
import { Icono } from "./iconos";
import { useEtapaScroll, type Etapa } from "./useEtapaScroll";

const ETAPAS: Etapa[] = [0, 1, 2];

/**
 * Posición de cada etapa respecto de la actual: la que se ve está "dentro",
 * las que ya pasaron salen hacia arriba y las que faltan esperan abajo. Así,
 * al volver a subir, cada grupo regresa por donde se fue.
 *
 * Con "reducir movimiento" no hay desplazamiento, solo un fundido corto.
 */
function clasesEtapa(etapa: Etapa, actual: Etapa): string {
  const base =
    "absolute inset-0 transition-[opacity,transform] duration-600 ease-[cubic-bezier(.2,.7,.2,1)] " +
    "motion-reduce:translate-y-0 motion-reduce:duration-200";
  if (etapa === actual) return `${base} opacity-100 translate-y-0`;
  if (etapa < actual) return `${base} pointer-events-none opacity-0 -translate-y-[60px]`;
  return `${base} pointer-events-none opacity-0 translate-y-[60px]`;
}

function Encabezado({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-3">
        <Sobretitulo>Categorías</Sobretitulo>
        <h2 className="font-titulos text-[32px] font-bold tracking-[-1px] text-noche md:text-[44px]">
          ¿Qué servicio buscas hoy?
        </h2>
      </div>
      <div className="flex items-center gap-7">
        {children}
        <Link
          to="/buscar"
          className="rounded-sm font-bold text-primario hover:text-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
        >
          Ver todas las categorías <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Categorías guiadas por scroll: tres categorías, luego tres más, y al final
 * el logo en grande.
 *
 * Cómo funciona: la sección mide 2400px y su contenido es sticky (top 0,
 * alto de pantalla), así que queda quieto mientras la sección pasa por
 * detrás. useEtapaScroll convierte cuánto se ha recorrido en una etapa, y
 * cada grupo cambia de clase según esa etapa; las transiciones CSS hacen el
 * resto.
 *
 * Bajo lg se muestra una lista normal: tres tarjetas apiladas no caben en el
 * alto de un teléfono, y la secuencia dejaría tarjetas cortadas.
 */
export function CategoriasScroll() {
  return (
    <section id="servicios" className="bg-blanco">
      <ListaMovil />
      <SecuenciaEscritorio />
    </section>
  );
}

function ListaMovil() {
  return (
    <Contenedor className="flex flex-col gap-10 py-16 md:py-20 lg:hidden">
      <Encabezado />
      <ul className="grid gap-5 md:grid-cols-2">
        {CATEGORIAS.map((categoria) => (
          <li key={categoria.nombre} className="grid">
            <CategoriaCard categoria={categoria} />
          </li>
        ))}
      </ul>
    </Contenedor>
  );
}

function SecuenciaEscritorio() {
  const seccion = useRef<HTMLDivElement>(null);
  const fijo = useRef<HTMLDivElement>(null);
  const { etapa, irAEtapa } = useEtapaScroll(seccion, fijo);

  return (
    <div ref={seccion} className="relative hidden h-[2400px] lg:block">
      <div ref={fijo} className="sticky top-0 h-screen max-h-[860px] min-h-[680px] overflow-hidden">
        <Contenedor className="flex h-full flex-col gap-12 pt-[88px] pb-[72px]">
          <Encabezado>
            {/* Indicador de etapa: refuerza visualmente lo que ya dice el contenido. */}
            <div aria-hidden="true" className="flex gap-2">
              {ETAPAS.map((e) => (
                <span
                  key={e}
                  className={`size-2.5 rounded-full transition-[background-color,transform] duration-300 ${
                    e === etapa ? "scale-130 bg-primario" : "bg-borde-fuerte"
                  }`}
                />
              ))}
            </div>
          </Encabezado>

          <div className="relative grow">
            {GRUPOS_CATEGORIAS.map((grupo, i) => {
              const etapaGrupo = i as Etapa;
              return (
                <ul
                  key={i}
                  data-etapa={etapaGrupo}
                  className={`grid auto-rows-min grid-cols-3 gap-6 ${clasesEtapa(etapaGrupo, etapa)}`}
                  // Si el foco del teclado entra a un grupo que no se ve, se
                  // desplaza la página hasta él para que aparezca.
                  onFocus={() => etapaGrupo !== etapa && irAEtapa(etapaGrupo)}
                >
                  {grupo.map((categoria) => (
                    <li key={categoria.nombre} className="grid">
                      <CategoriaCard categoria={categoria} />
                    </li>
                  ))}
                </ul>
              );
            })}

            {/* Cierre de la secuencia: repite la marca, así que es decorativo. */}
            <div
              aria-hidden="true"
              data-etapa={2}
              className={`flex items-center justify-center ${clasesEtapa(2, etapa)}`}
            >
              <LogoLocalCL tamano={120} claseTexto="text-8xl font-extrabold tracking-[-3px] text-noche" />
            </div>
          </div>

          <p
            aria-hidden="true"
            className={`flex items-center gap-2 self-center text-sm font-medium text-texto-tenue transition-opacity duration-400 ${
              etapa === 2 ? "opacity-0" : "opacity-100"
            }`}
          >
            <Icono nombre="flechaAbajo" tamano={16} grosor={2} />
            Sigue bajando para ver más
          </p>
        </Contenedor>
      </div>
    </div>
  );
}
