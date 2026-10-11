import { useId, useState } from "react";
import { Link } from "react-router";
import type { DatosServicio, EstadoServicio, ServicioPropio } from "../api/cliente";
import { nombreCategoria, textoPrecio } from "../servicios/formato";
import { Boton, clasesBoton } from "./Boton";

export const ESTADO_VISIBLE: Record<EstadoServicio, { texto: string; clases: string }> = {
  PUBLICADO: { texto: "Publicado", clases: "bg-exito-50 text-exito-700" },
  PAUSADO: { texto: "Pausado", clases: "bg-niebla text-texto-suave" },
  BORRADOR: { texto: "Borrador", clases: "bg-niebla text-texto-suave" },
  OCULTO: { texto: "Oculto por moderación", clases: "bg-alerta-50 text-alerta-700" },
};

/** Datos para volver a enviar un servicio tal cual, cambiando solo el estado. */
export function datosDe(servicio: ServicioPropio, estado: "PUBLICADO" | "PAUSADO"): DatosServicio {
  return {
    categoria: servicio.categoria.slug,
    categoriaPersonalizada: servicio.categoriaPersonalizada,
    titulo: servicio.titulo,
    descripcion: servicio.descripcion,
    precioDesde: servicio.precioDesde,
    precioHasta: servicio.precioHasta,
    unidadPrecio: servicio.unidadPrecio,
    estado,
  };
}

/** Qué decir después de guardar un servicio, según el estado en que quedó. */
export function mensajeGuardado(servicio: ServicioPropio, pidioPublicar: boolean): string {
  if (servicio.estado === "PUBLICADO") return `«${servicio.titulo}» está publicado.`;
  if (pidioPublicar) return `«${servicio.titulo}» quedó pausado: revisa abajo lo que te falta para publicarlo.`;
  return `«${servicio.titulo}» quedó guardado como ${ESTADO_VISIBLE[servicio.estado].texto.toLowerCase()}.`;
}

/**
 * Un servicio en la lista del prestador, con sus acciones: editar, pausar o
 * publicar, ver la publicación y eliminar (con confirmación, porque no se
 * puede deshacer). Las acciones devuelven un mensaje de error o null.
 */
export function FilaServicio({
  servicio,
  alCambiarEstado,
  alEliminar,
}: {
  servicio: ServicioPropio;
  alCambiarEstado(estado: "PUBLICADO" | "PAUSADO"): Promise<string | null>;
  alEliminar(): Promise<string | null>;
}) {
  const idTitulo = useId();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estado = ESTADO_VISIBLE[servicio.estado];
  const clasesAccion = `w-auto! px-4 ${clasesBoton("secundario")}`;

  async function ejecutar(accion: () => Promise<string | null>) {
    setOcupado(true);
    setError(await accion());
    setOcupado(false);
    setConfirmando(false);
  }

  return (
    <article aria-labelledby={idTitulo} className="rounded-medio border border-borde p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={idTitulo} className="font-titulos text-base font-bold text-noche">
          {servicio.titulo}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.texto}</span>
      </div>
      <p className="mt-1 text-sm text-texto-suave">
        {nombreCategoria(servicio)} · {textoPrecio(servicio)}
      </p>

      {error && (
        <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {confirmando ? (
        <div className="mt-3 rounded-chico bg-error-50 p-3 text-sm text-error-700">
          <p className="font-semibold">¿Eliminar este servicio? No se puede deshacer.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton type="button" variante="secundario" disabled={ocupado} onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
            <Boton type="button" cargando={ocupado} onClick={() => ejecutar(alEliminar)}>
              Sí, eliminar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/mi/servicios/${servicio.id}/editar`} className={clasesAccion}>
            Editar
          </Link>
          {servicio.estado === "PUBLICADO" && (
            <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => ejecutar(() => alCambiarEstado("PAUSADO"))}>
              Pausar
            </Boton>
          )}
          {servicio.estado === "PAUSADO" && (
            <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => ejecutar(() => alCambiarEstado("PUBLICADO"))}>
              Publicar
            </Boton>
          )}
          {servicio.estado === "PUBLICADO" && (
            <Link to={`/servicios/${servicio.id}`} className={clasesAccion}>
              Ver publicación
            </Link>
          )}
          <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => setConfirmando(true)}>
            Eliminar
          </Boton>
        </div>
      )}
    </article>
  );
}
