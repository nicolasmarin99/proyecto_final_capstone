import { useEffect, useId, useState } from "react";
import { CALIFICACION_MAXIMA } from "@localcl/shared";
import type { ClienteApi, Estrella, PaginaValoraciones, ResumenCorto, ResumenValoraciones } from "../api/cliente";
import { formatearPromedio, inicial, textoCantidad, textoResumen } from "../servicios/valoraciones";
import { Boton } from "./Boton";
import { Icono } from "./iconos";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const ESTRELLAS: Estrella[] = ["5", "4", "3", "2", "1"];

/**
 * Estrellas de solo lectura. Decorativas para el lector de pantalla: quien
 * las usa siempre pone al lado el texto con el número.
 */
export function Estrellas({ valor, tamano = 16 }: { valor: number; tamano?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {Array.from({ length: CALIFICACION_MAXIMA }, (_, indice) => {
        // Se redondea al entero más cercano (4,3 → 4 llenas); el número exacto va en el texto.
        const llena = indice < Math.round(valor);
        return (
          <svg key={indice} width={tamano} height={tamano} viewBox="0 0 24 24" className={llena ? "text-alerta-700" : "text-borde-fuerte"}>
            <path
              d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

/**
 * El resumen en una línea, para junto al nombre y para las tarjetas.
 * Sin valoraciones dice «Aún sin valoraciones»; con menos de 3, solo el
 * conteo: nunca un cero ni el promedio de una sola reseña.
 */
export function ResumenEnLinea({ resumen, tamano = "normal" }: { resumen: ResumenCorto; tamano?: "chico" | "normal" }) {
  const texto = textoResumen(resumen);
  const clases = tamano === "chico" ? "text-xs" : "text-sm";

  if (resumen.promedio === null) {
    return <span className={`${clases} text-texto-suave`}>{texto}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${clases}`}>
      <Estrellas valor={resumen.promedio} tamano={tamano === "chico" ? 14 : 16} />
      {/* El lector de pantalla lee la frase completa; a la vista, el número y el conteo. */}
      <span className="sr-only">{texto}</span>
      <span aria-hidden="true">
        <span className="font-bold text-noche">{formatearPromedio(resumen.promedio)}</span>
        <span className="text-texto-suave"> ({resumen.cantidad})</span>
      </span>
    </span>
  );
}

/** Distribución por estrella: solo existe con 3 o más valoraciones (lo decide la API). */
export function Distribucion({ resumen }: { resumen: ResumenValoraciones }) {
  if (!resumen.distribucion || resumen.promedio === null) return null;
  const { distribucion } = resumen;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="text-center">
        <p className="font-titulos text-[40px] leading-none font-bold text-noche">{formatearPromedio(resumen.promedio)}</p>
        <div className="mt-1.5">
          <Estrellas valor={resumen.promedio} />
        </div>
        <p className="mt-1 text-xs text-texto-suave">{textoCantidad(resumen.cantidad)}</p>
      </div>
      <ul aria-label="Distribución por estrella" className="min-w-48 flex-1 space-y-1">
        {ESTRELLAS.map((estrella) => {
          const cantidad = distribucion[estrella];
          const porcentaje = resumen.cantidad > 0 ? Math.round((cantidad / resumen.cantidad) * 100) : 0;
          return (
            <li key={estrella} className="flex items-center gap-2 text-xs text-texto-suave">
              <span className="w-16 shrink-0">
                {estrella} {estrella === "1" ? "estrella" : "estrellas"}
              </span>
              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-niebla">
                <span className="block h-full rounded-full bg-alerta-700" style={{ width: `${porcentaje}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-semibold text-noche">{cantidad}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Sección completa de valoraciones de un prestador: resumen, distribución
 * y lista paginada. Pública. `version` se incrementa para volver a cargar
 * (por ejemplo, después de que el cliente valora).
 */
export function ValoracionesDelPrestador({
  prestadorId,
  cliente,
  version = 0,
}: {
  prestadorId: string;
  cliente: ClienteApi;
  version?: number;
}) {
  const idTitulo = useId();
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaValoraciones | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setError(false);
    cliente
      .listarValoraciones(prestadorId, pagina)
      .then((respuesta) => {
        if (!cancelado) setDatos(respuesta);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, prestadorId, pagina, version]);

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <section id="valoraciones" aria-labelledby={idTitulo} className="mt-8 scroll-mt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold">
        Valoraciones
      </h2>

      {error && <p className="mt-2 text-sm text-texto-suave">No fue posible cargar las valoraciones.</p>}
      {!error && !datos && <p className="mt-2 text-sm text-texto-suave">Cargando valoraciones…</p>}

      {datos && (
        <>
          <div className="mt-3">
            {datos.resumen.promedio === null ? (
              <p className="text-sm text-texto-suave">
                {datos.resumen.cantidad === 0
                  ? "Aún sin valoraciones."
                  : `${textoCantidad(datos.resumen.cantidad)}. El promedio aparece desde la tercera.`}
              </p>
            ) : (
              <Distribucion resumen={datos.resumen} />
            )}
          </div>

          {datos.valoraciones.length > 0 && (
            <ul aria-label="Lista de valoraciones" className="mt-5 space-y-3">
              {datos.valoraciones.map((valoracion) => (
                <li key={valoracion.id} className="rounded-medio border border-borde bg-blanco p-4">
                  <div className="flex items-start gap-3">
                    {valoracion.cliente.foto ? (
                      <img src={valoracion.cliente.foto} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-hielo font-bold text-primario">
                        {inicial(valoracion.cliente.nombre)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-semibold text-noche">{valoracion.cliente.nombre}</span>
                        <Estrellas valor={valoracion.calificacion} tamano={14} />
                        <span className="sr-only">
                          {valoracion.calificacion} de 5 {valoracion.calificacion === 1 ? "estrella" : "estrellas"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-texto-suave">
                        {fecha.format(new Date(valoracion.creadaEn))}
                        {valoracion.editada && " · Editada"}
                      </p>
                      {valoracion.comentario && (
                        <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-noche">{valoracion.comentario}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {paginas > 1 && (
            <nav aria-label="Páginas de valoraciones" className="mt-4 flex items-center justify-between gap-3 text-sm">
              <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                Anteriores
              </Boton>
              <span className="text-texto-suave">
                Página {pagina} de {paginas}
              </span>
              <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
                Siguientes
              </Boton>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Selector de estrellas: un grupo de radios nativos. El teclado funciona
 * como en cualquier grupo de radios (Tab entra, flechas cambian el valor) y
 * el lector de pantalla anuncia «3 estrellas, 3 de 5».
 */
export function SelectorEstrellas({
  valor,
  alCambiar,
  error,
  idError,
}: {
  valor: number;
  alCambiar(valor: number): void;
  error?: string;
  idError: string;
}) {
  const nombre = useId();
  const [encima, setEncima] = useState<number | null>(null);
  const mostrado = encima ?? valor;

  return (
    <fieldset aria-describedby={error ? idError : undefined} aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-bold text-noche">Tu calificación</legend>
      <div className="mt-1.5 flex items-center gap-1" onMouseLeave={() => setEncima(null)}>
        {Array.from({ length: CALIFICACION_MAXIMA }, (_, indice) => {
          const estrellas = indice + 1;
          return (
            <label
              key={estrellas}
              onMouseEnter={() => setEncima(estrellas)}
              className="flex size-11 cursor-pointer items-center justify-center rounded-chico has-focus-visible:outline-2 has-focus-visible:outline-primario"
            >
              <input
                type="radio"
                name={nombre}
                value={estrellas}
                checked={valor === estrellas}
                onChange={() => alCambiar(estrellas)}
                className="sr-only"
              />
              <span className="sr-only">{estrellas === 1 ? "1 estrella" : `${estrellas} estrellas`}</span>
              <Icono
                nombre="estrella"
                tamano={30}
                grosor={1.6}
                className={estrellas <= mostrado ? "fill-alerta-700 text-alerta-700" : "text-borde-fuerte"}
              />
            </label>
          );
        })}
        <span aria-hidden="true" className="ml-2 text-sm whitespace-nowrap text-texto-suave">
          {mostrado > 0 ? `${mostrado} de 5` : "Elige de 1 a 5"}
        </span>
      </div>
      {error && (
        <p id={idError} className="mt-1.5 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
