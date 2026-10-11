import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorApi, type RequisitoPendiente, type ServicioPropio } from "../../api/cliente";
import { useAuth } from "../../auth/ContextoAuth";
import { CompletarPerfilPrimero, SeccionArea } from "../../componentes/AreaPrestador";
import { clasesBoton } from "../../componentes/Boton";
import { datosDe, FilaServicio, mensajeGuardado } from "../../componentes/FilaServicio";
import { Icono } from "../../componentes/iconos";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";

function mensajeError(causa: unknown, porDefecto: string) {
  return causa instanceof ErrorApi ? causa.message : porDefecto;
}

/** Mensaje que deja el formulario al guardar (navigate con state.mensaje). */
function leerMensaje(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("mensaje" in state)) return null;
  const mensaje: unknown = (state as Record<string, unknown>).mensaje;
  return typeof mensaje === "string" ? mensaje : null;
}

const enlacePublicar = `sm:w-auto! sm:px-6 ${clasesBoton("principal")}`;

/**
 * /mi/servicios: la lista de servicios del prestador con sus acciones.
 *
 * Crear y editar son páginas aparte; al volver de ellas, el mensaje de
 * confirmación llega en el state de la navegación.
 */
export default function PaginaMisServicios() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [servicios, setServicios] = useState<ServicioPropio[] | null>(null);
  const [requisitos, setRequisitos] = useState<RequisitoPendiente[]>([]);
  const [aviso, setAviso] = useState<string | null>(() => leerMensaje(ubicacion.state));
  const [error, setError] = useState<string | null>(null);

  const tienePerfil = estado && !estado.cargando ? estado.perfil !== null : null;

  // El mensaje se muestra una vez: se borra del historial para que no
  // reaparezca al recargar la página.
  useEffect(() => {
    if (leerMensaje(ubicacion.state)) navegar(ubicacion.pathname, { replace: true, state: null });
  }, [ubicacion.state, ubicacion.pathname, navegar]);

  const cargar = useCallback(async () => {
    try {
      const datos = await cliente.listarMisServicios();
      setServicios(datos.servicios);
      setRequisitos(datos.requisitosPendientes);
    } catch (causa) {
      setError(mensajeError(causa, "No fue posible cargar tus servicios."));
    }
  }, [cliente]);

  useEffect(() => {
    // Sin perfil la API responde 409: no se pregunta.
    if (tienePerfil) void cargar();
  }, [cargar, tienePerfil]);

  async function cambiarEstado(servicio: ServicioPropio, nuevo: "PUBLICADO" | "PAUSADO") {
    try {
      const resultado = await cliente.editarServicio(servicio.id, datosDe(servicio, nuevo));
      setServicios((actuales) => (actuales ?? []).map((otro) => (otro.id === servicio.id ? resultado.servicio : otro)));
      setRequisitos(resultado.requisitosPendientes);
      setAviso(mensajeGuardado(resultado.servicio, nuevo === "PUBLICADO"));
      void estado?.recargar();
      return null;
    } catch (causa) {
      return mensajeError(causa, "No fue posible cambiar el estado.");
    }
  }

  async function eliminar(servicio: ServicioPropio) {
    try {
      await cliente.eliminarServicio(servicio.id);
      setServicios((actuales) => (actuales ?? []).filter((otro) => otro.id !== servicio.id));
      setAviso(`«${servicio.titulo}» fue eliminado.`);
      void estado?.recargar();
      return null;
    } catch (causa) {
      return mensajeError(causa, "No fue posible eliminar el servicio.");
    }
  }

  return (
    <SeccionArea
      titulo="Mis servicios"
      bajada="Lo que los clientes encuentran al buscar en tus comunas."
      // Sin perfil no se ofrece publicar: abajo va el llamado a completarlo.
      accion={
        tienePerfil && (
          <Link to="/mi/servicios/nuevo" className={enlacePublicar}>
            Publicar servicio
          </Link>
        )
      }
    >
      {tienePerfil === null && <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil…</p>}

      {tienePerfil === false && (
        <CompletarPerfilPrimero motivo="Tus servicios se muestran junto a tu comuna, tu radio de atención y tu teléfono: sin ellos, nadie podría contactarte." />
      )}

      {tienePerfil && (
        <>
          {aviso && (
            <p role="status" className="motion-safe:animate-aparecer-corto mt-5 rounded-chico border border-borde bg-hielo/60 px-4 py-3 text-sm text-noche">
              {aviso}
            </p>
          )}

          {requisitos.length > 0 && (
            <div className="mt-5 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
              <p className="font-semibold">Tus servicios no se pueden publicar todavía. Te falta:</p>
              <ul className="mt-1 list-disc pl-5">
                {requisitos.map((requisito) => (
                  <li key={requisito.codigo}>{requisito.mensaje}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-5 text-sm font-medium text-error-700">
              {error}
            </p>
          )}

          {servicios === null && !error && <p className="mt-6 text-sm text-texto-suave">Cargando tus servicios…</p>}

          {servicios?.length === 0 && (
            <div className="mt-6 flex flex-col items-center rounded-medio border border-dashed border-borde-fuerte px-5 py-10 text-center">
              <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-hielo text-primario">
                <Icono nombre="martillo" tamano={28} />
              </span>
              <h2 className="mt-4 font-titulos text-lg font-bold text-noche">Todavía no publicas ningún servicio</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-texto-suave">
                Un servicio dice qué haces, en qué categoría y cuánto cobras. Es lo que aparece cuando un cliente
                busca en tus comunas, y desde ahí te contacta por WhatsApp.
              </p>
              <Link to="/mi/servicios/nuevo" className={`mt-6 ${enlacePublicar}`}>
                Publicar mi primer servicio
              </Link>
            </div>
          )}

          {servicios && servicios.length > 0 && (
            <div className="mt-6 space-y-3">
              {servicios.map((servicio) => (
                <FilaServicio
                  key={servicio.id}
                  servicio={servicio}
                  alCambiarEstado={(nuevo) => cambiarEstado(servicio, nuevo)}
                  alEliminar={() => eliminar(servicio)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </SeccionArea>
  );
}
