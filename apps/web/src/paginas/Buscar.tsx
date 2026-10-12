import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PRECIO_MAXIMO, type OrdenBusqueda } from "@localcl/shared";
import { ErrorApi, type Categoria, type Comuna, type FiltrosBusqueda, type PaginaBusqueda } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton, clasesBoton } from "../componentes/Boton";
import { CampoSelector } from "../componentes/CampoSelector";
import { CampoTexto } from "../componentes/CampoTexto";
import { Icono } from "../componentes/iconos";
import { Contenedor } from "../componentes/landing/Contenedor";
import { Footer } from "../componentes/landing/Footer";
import { SelectorComuna } from "../componentes/SelectorComuna";
import { TarjetaResultado } from "../componentes/TarjetaResultado";
import { hayFiltros, leerFiltros, rutaBuscar, sinFiltro } from "../servicios/filtrosBusqueda";

type Estado = { tipo: "cargando" } | { tipo: "listo"; datos: PaginaBusqueda } | { tipo: "error"; mensaje: string };

const pesos = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

// ─── Formulario ────────────────────────────────────────────────────────────

interface Formulario {
  q: string;
  comuna: string;
  categoria: string;
  precioMax: string;
  orden: string;
}

function formularioDe(filtros: FiltrosBusqueda): Formulario {
  return {
    q: filtros.q ?? "",
    comuna: filtros.comuna === undefined ? "" : String(filtros.comuna),
    categoria: filtros.categoria ?? "",
    precioMax: filtros.precioMax === undefined ? "" : String(filtros.precioMax),
    orden: filtros.orden === "precio" ? "precio" : "",
  };
}

/**
 * El formulario no busca: arma la URL nueva y navega. La búsqueda la
 * dispara el cambio de URL, así enviar, compartir el enlace y el botón
 * atrás pasan por el mismo camino.
 */
function FormularioBusqueda({
  inicial,
  comunas,
  categorias,
  cargandoComunas,
}: {
  inicial: FiltrosBusqueda;
  comunas: Comuna[];
  categorias: Categoria[];
  cargandoComunas: boolean;
}) {
  const navegar = useNavigate();
  const prefijo = useId();
  const [formulario, setFormulario] = useState<Formulario>(() => formularioDe(inicial));
  const [errorPrecio, setErrorPrecio] = useState<string | undefined>(undefined);

  function cambiar(campo: keyof Formulario) {
    return (valor: string) => setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const precio = formulario.precioMax.trim();
    const precioMax = precio === "" ? undefined : Number(precio);

    if (precioMax !== undefined && (!Number.isInteger(precioMax) || precioMax < 0 || precioMax > PRECIO_MAXIMO)) {
      setErrorPrecio("Escribe el monto en pesos, sin puntos ni decimales.");
      return;
    }
    setErrorPrecio(undefined);

    const orden: OrdenBusqueda | undefined = formulario.orden === "precio" ? "precio" : undefined;
    // Sin página: una búsqueda nueva siempre parte en la primera.
    navegar(
      rutaBuscar({
        q: formulario.q,
        comuna: formulario.comuna ? Number(formulario.comuna) : undefined,
        categoria: formulario.categoria || undefined,
        precioMax,
        orden,
      }),
    );
  }

  return (
    <form
      role="search"
      aria-label="Buscar servicios"
      onSubmit={enviar}
      noValidate
      className="mt-6 rounded-grande border border-borde bg-blanco p-5 shadow-tarjeta md:p-6"
    >
      <div className="grid gap-x-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
        <CampoTexto
          id={`${prefijo}-q`}
          etiqueta="¿Qué necesitas?"
          autoComplete="off"
          valor={formulario.q}
          alCambiar={cambiar("q")}
          ayuda="Por ejemplo: gasfiter, enchufes, cerrajero."
        />
        <SelectorComuna
          id={`${prefijo}-comuna`}
          comunas={comunas}
          cargando={cargandoComunas}
          valor={formulario.comuna}
          alCambiar={cambiar("comuna")}
          vacio="Todas las comunas"
        />
        <CampoSelector
          id={`${prefijo}-categoria`}
          etiqueta="Categoría"
          valor={formulario.categoria}
          alCambiar={cambiar("categoria")}
          opciones={categorias.map((categoria) => ({ valor: categoria.slug, texto: categoria.nombre }))}
          vacio="Todas las categorías"
        />
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start">
        <CampoTexto
          id={`${prefijo}-precio`}
          etiqueta="Precio máximo"
          tipo="number"
          inputMode="numeric"
          autoComplete="off"
          valor={formulario.precioMax}
          alCambiar={cambiar("precioMax")}
          error={errorPrecio}
          ayuda="Opcional, en pesos."
        />
        <CampoSelector
          id={`${prefijo}-orden`}
          etiqueta="Ordenar por"
          valor={formulario.orden}
          alCambiar={cambiar("orden")}
          opciones={[{ valor: "precio", texto: "Menor precio" }]}
          vacio="Más recientes"
        />
        <div className="mt-5 flex gap-3 sm:col-span-2 lg:col-span-1 lg:mt-[29px]">
          <Boton type="submit" className="lg:w-auto! lg:px-8">
            <Icono nombre="lupa" tamano={20} grosor={2} />
            Buscar
          </Boton>
          {hayFiltros(inicial) && (
            <Link to="/buscar" className={`w-auto! shrink-0 px-5 ${clasesBoton("secundario")}`}>
              Limpiar
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}

// ─── Filtros activos ───────────────────────────────────────────────────────

interface FiltroActivo {
  clave: "q" | "categoria" | "comuna" | "precioMax";
  texto: string;
}

function filtrosActivos(filtros: FiltrosBusqueda, comunas: Comuna[], categorias: Categoria[]): FiltroActivo[] {
  const activos: FiltroActivo[] = [];
  if (filtros.q) activos.push({ clave: "q", texto: `«${filtros.q}»` });
  if (filtros.comuna !== undefined) {
    activos.push({ clave: "comuna", texto: comunas.find((comuna) => comuna.id === filtros.comuna)?.nombre ?? "Comuna elegida" });
  }
  if (filtros.categoria) {
    activos.push({
      clave: "categoria",
      texto: categorias.find((categoria) => categoria.slug === filtros.categoria)?.nombre ?? filtros.categoria,
    });
  }
  if (filtros.precioMax !== undefined) activos.push({ clave: "precioMax", texto: `Hasta ${pesos.format(filtros.precioMax)}` });
  return activos;
}

/** Cada filtro activo es un enlace que lo quita: ampliar la búsqueda está a un clic. */
function ChipsFiltros({ filtros, activos }: { filtros: FiltrosBusqueda; activos: FiltroActivo[] }) {
  if (activos.length === 0) return null;

  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap gap-2">
      {activos.map((activo) => (
        <li key={activo.clave}>
          <Link
            to={rutaBuscar(sinFiltro(filtros, activo.clave))}
            aria-label={`Quitar filtro: ${activo.texto}`}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-borde-fuerte bg-blanco py-1 pr-2.5 pl-3.5 text-sm font-medium text-noche transition-colors hover:border-primario hover:text-primario focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
          >
            {activo.texto}
            <Icono nombre="cerrar" tamano={14} grosor={2.2} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Estados ───────────────────────────────────────────────────────────────

function Cargando() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Buscando servicios…
      </p>
      <ul aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, indice) => (
          <li key={indice} className="h-[214px] rounded-medio border border-borde bg-blanco p-5 shadow-tarjeta motion-safe:animate-pulse">
            <div className="h-6 w-24 rounded-full bg-hielo" />
            <div className="mt-4 h-5 w-4/5 rounded-chico bg-niebla" />
            <div className="mt-2 h-5 w-3/5 rounded-chico bg-niebla" />
            <div className="mt-10 h-4 w-2/5 rounded-chico bg-niebla" />
            <div className="mt-3 h-4 w-3/5 rounded-chico bg-niebla" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sin resultados: en vez de una página vacía, formas concretas de ampliar
 * la búsqueda. La comuna va primero porque es el filtro que más recorta.
 */
function SinResultados({ filtros, activos }: { filtros: FiltrosBusqueda; activos: FiltroActivo[] }) {
  const comuna = activos.find((activo) => activo.clave === "comuna");
  const otros = activos.filter((activo) => activo.clave !== "comuna");

  return (
    <div className="flex flex-col items-center rounded-grande border border-dashed border-borde-fuerte bg-blanco px-5 py-12 text-center">
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-hielo text-primario">
        <Icono nombre="lupa" tamano={28} />
      </span>
      <h2 className="mt-4 font-titulos text-xl font-bold text-noche">
        {hayFiltros(filtros)
          ? comuna
            ? `No encontramos servicios en ${comuna.texto}`
            : "No encontramos servicios con esos filtros"
          : "Todavía no hay servicios publicados"}
      </h2>

      {hayFiltros(filtros) ? (
        <>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-texto-suave">
            {comuna
              ? "Puede que haya prestadores en comunas cercanas. Prueba sin el filtro de comuna:"
              : "Prueba ampliando la búsqueda:"}
          </p>
          <ul className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            {comuna && (
              <li>
                <Link to={rutaBuscar(sinFiltro(filtros, "comuna"))} className={`sm:w-auto! sm:px-6 ${clasesBoton("principal")}`}>
                  Buscar en todas las comunas
                </Link>
              </li>
            )}
            {otros.map((activo) => (
              <li key={activo.clave}>
                <Link to={rutaBuscar(sinFiltro(filtros, activo.clave))} className={`sm:w-auto! sm:px-6 ${clasesBoton("secundario")}`}>
                  {activo.clave === "q" ? `Buscar sin ${activo.texto}` : `Quitar ${activo.texto}`}
                </Link>
              </li>
            ))}
          </ul>
          {filtros.q && (
            <p className="mt-5 max-w-md text-sm text-texto-suave">
              También puedes revisar la ortografía o usar menos palabras: «gasfiter» encuentra más que «gasfíter
              urgente a domicilio».
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-texto-suave">
          Vuelve pronto: cada día se suman prestadores con su identidad verificada.
        </p>
      )}
    </div>
  );
}

function ErrorBusqueda({ mensaje, alReintentar }: { mensaje: string; alReintentar(): void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-grande border border-error-700/20 bg-error-50 px-5 py-10 text-center">
      <h2 className="font-titulos text-lg font-bold text-error-700">No pudimos hacer la búsqueda</h2>
      <p className="mt-2 max-w-md text-sm text-error-700">{mensaje}</p>
      <Boton type="button" variante="secundario" className="mt-5 sm:w-auto! sm:px-8" onClick={alReintentar}>
        Reintentar
      </Boton>
    </div>
  );
}

function Paginacion({ filtros, datos, alCambiar }: { filtros: FiltrosBusqueda; datos: PaginaBusqueda; alCambiar(): void }) {
  const totalPaginas = Math.ceil(datos.total / datos.porPagina);
  if (totalPaginas <= 1) return null;

  const enlace = `w-auto! px-5 ${clasesBoton("secundario")}`;
  const deshabilitado = "flex h-12 items-center rounded-boton border border-borde px-5 font-bold text-texto-tenue";

  return (
    <nav aria-label="Paginación" className="mt-8 flex items-center justify-between gap-3">
      {datos.pagina > 1 ? (
        <Link to={rutaBuscar({ ...filtros, pagina: datos.pagina - 1 })} onClick={alCambiar} className={enlace}>
          Anterior
        </Link>
      ) : (
        <span aria-hidden="true" className={deshabilitado}>
          Anterior
        </span>
      )}
      <p className="text-sm text-texto-suave">
        Página {datos.pagina} de {totalPaginas}
      </p>
      {datos.pagina < totalPaginas ? (
        <Link to={rutaBuscar({ ...filtros, pagina: datos.pagina + 1 })} onClick={alCambiar} className={enlace}>
          Siguiente
        </Link>
      ) : (
        <span aria-hidden="true" className={deshabilitado}>
          Siguiente
        </span>
      )}
    </nav>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────

/**
 * /buscar: el formulario arriba y los resultados abajo.
 *
 * La URL es la única fuente de los filtros. Cada vez que cambia (enviar el
 * formulario, quitar un filtro, cambiar de página, ir atrás) se vuelve a
 * consultar GET /servicios con esos mismos parámetros.
 */
export default function PaginaBuscar() {
  const { cliente } = useAuth();
  const [parametros] = useSearchParams();
  const clave = parametros.toString();
  const filtros = leerFiltros(parametros);

  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [cargandoComunas, setCargandoComunas] = useState(true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const titulo = useRef<HTMLHeadingElement>(null);
  // Al cambiar de página, el foco va al título de los resultados (y la vista con él).
  const enfocarResultados = useRef(false);

  useEffect(() => {
    cliente.listarComunas().then(setComunas, () => setComunas([])).finally(() => setCargandoComunas(false));
    cliente.listarCategorias().then(setCategorias, () => setCategorias([]));
  }, [cliente]);

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: "cargando" });

    cliente
      .buscarServicios(leerFiltros(new URLSearchParams(clave)))
      .then((datos) => {
        if (!cancelado) setEstado({ tipo: "listo", datos });
      })
      .catch((causa: unknown) => {
        if (cancelado) return;
        setEstado({
          tipo: "error",
          mensaje:
            causa instanceof ErrorApi && causa.estado < 500
              ? causa.message
              : "Revisa tu conexión a internet e inténtalo de nuevo.",
        });
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, clave, intento]);

  useEffect(() => {
    if (estado.tipo !== "listo" || !enfocarResultados.current) return;
    enfocarResultados.current = false;
    titulo.current?.focus();
    titulo.current?.scrollIntoView?.({ block: "start" });
  }, [estado]);

  const activos = filtrosActivos(filtros, comunas, categorias);
  const total = estado.tipo === "listo" ? estado.datos.total : null;

  return (
    <div className="flex flex-1 flex-col bg-niebla font-texto text-noche">
      <main className="grow">
        <Contenedor className="py-8 md:py-12">
          <h1 className="font-titulos text-[32px] leading-[1.1] font-bold tracking-[-1px] md:text-[40px]">Buscar servicios</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            Solo aparecen prestadores con su identidad verificada. Elige tu comuna para ver quién atiende ahí.
          </p>

          {/* key: si la URL cambia desde fuera (atrás, un chip), el formulario se rearma con ella. */}
          <FormularioBusqueda
            key={clave}
            inicial={filtros}
            comunas={comunas}
            categorias={categorias}
            cargandoComunas={cargandoComunas}
          />

          <section aria-labelledby="titulo-resultados" className="mt-8">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="titulo-resultados" ref={titulo} tabIndex={-1} className="font-titulos text-xl font-bold outline-none">
                Resultados
              </h2>
              {/* role=status: el lector de pantalla anuncia cuántos hay al terminar cada búsqueda. */}
              <p role="status" className="text-sm font-medium text-texto-suave">
                {total === null ? "" : total === 1 ? "1 servicio encontrado" : `${total} servicios encontrados`}
              </p>
            </div>

            <div className="mb-5">
              <ChipsFiltros filtros={filtros} activos={activos} />
            </div>

            {estado.tipo === "cargando" && <Cargando />}
            {estado.tipo === "error" && <ErrorBusqueda mensaje={estado.mensaje} alReintentar={() => setIntento((n) => n + 1)} />}
            {estado.tipo === "listo" && estado.datos.resultados.length === 0 && <SinResultados filtros={filtros} activos={activos} />}
            {estado.tipo === "listo" && estado.datos.resultados.length > 0 && (
              <>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {estado.datos.resultados.map((resultado) => (
                    <li key={resultado.id}>
                      <TarjetaResultado resultado={resultado} />
                    </li>
                  ))}
                </ul>
                <Paginacion
                  filtros={filtros}
                  datos={estado.datos}
                  alCambiar={() => {
                    enfocarResultados.current = true;
                  }}
                />
              </>
            )}
          </section>
        </Contenedor>
      </main>
      <Footer />
    </div>
  );
}
