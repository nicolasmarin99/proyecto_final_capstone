import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ErrorApi, type Categoria, type DatosServicio, type ServicioPropio } from "../../api/cliente";
import { useAuth } from "../../auth/ContextoAuth";
import { CompletarPerfilPrimero, SeccionArea } from "../../componentes/AreaPrestador";
import { mensajeGuardado } from "../../componentes/FilaServicio";
import { FormularioServicio } from "../../componentes/FormularioServicio";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";

/**
 * /mi/servicios/nuevo y /mi/servicios/:id/editar: el formulario de un
 * servicio en su propia página.
 *
 * Al guardar vuelve a /mi/servicios con un mensaje que dice en qué estado
 * quedó. Para editar, el servicio se busca entre los del prestador: la API
 * no expone uno propio por id, y así nadie edita uno ajeno ni por error.
 */
export default function PaginaEditorServicio() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();
  const navegar = useNavigate();
  const { id } = useParams();
  const editando = id !== undefined;

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  // undefined mientras se busca; null si no está entre los del prestador.
  const [servicio, setServicio] = useState<ServicioPropio | null | undefined>(editando ? undefined : null);
  const [enviando, setEnviando] = useState(false);
  const [erroresApi, setErroresApi] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const tienePerfil = estado && !estado.cargando ? estado.perfil !== null : null;

  useEffect(() => {
    cliente.listarCategorias().then(setCategorias, () => setCategorias([]));
  }, [cliente]);

  useEffect(() => {
    if (!editando || !tienePerfil) return;
    let cancelado = false;

    cliente
      .listarMisServicios()
      .then((datos) => {
        if (!cancelado) setServicio(datos.servicios.find((propio) => propio.id === id) ?? null);
      })
      .catch(() => {
        if (!cancelado) setError("No fue posible cargar el servicio. Recarga la página.");
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, editando, id, tienePerfil]);

  async function guardar(datos: DatosServicio) {
    setEnviando(true);
    setErroresApi({});
    setError(null);

    try {
      const resultado = servicio ? await cliente.editarServicio(servicio.id, datos) : await cliente.crearServicio(datos);
      await estado?.recargar();
      navegar("/mi/servicios", { state: { mensaje: mensajeGuardado(resultado.servicio, datos.estado === "PUBLICADO") } });
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.codigo === "DATOS_INVALIDOS") {
        setErroresApi(Object.fromEntries(causa.detalles.map((detalle) => [detalle.campo, detalle.mensaje])));
      } else {
        setError(causa instanceof ErrorApi ? causa.message : "No fue posible guardar el servicio.");
      }
      setEnviando(false);
    }
  }

  return (
    <SeccionArea
      titulo={editando ? "Editar servicio" : "Publicar servicio"}
      bajada={editando ? undefined : "Cuenta qué haces y cuánto cobras. Puedes cambiarlo cuando quieras."}
    >
      {error && (
        <p role="alert" className="mt-5 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {tienePerfil === null || (editando && servicio === undefined && !error) ? (
        <p className="mt-6 text-sm text-texto-suave">Cargando…</p>
      ) : tienePerfil === false ? (
        <CompletarPerfilPrimero motivo="Tus servicios se muestran junto a tu comuna, tu radio de atención y tu teléfono: sin ellos, nadie podría contactarte." />
      ) : editando && servicio === null ? (
        <p className="mt-6 text-sm text-texto-suave">No encontramos este servicio entre los tuyos. Puede que ya lo hayas eliminado.</p>
      ) : (
        servicio !== undefined && (
          <div className="max-w-xl">
            <FormularioServicio
              categorias={categorias}
              inicial={servicio}
              requisitos={estado && !estado.cargando ? estado.requisitos : null}
              enviando={enviando}
              erroresApi={erroresApi}
              alEnviar={guardar}
              alCancelar={() => navegar("/mi/servicios")}
            />
          </div>
        )
      )}
    </SeccionArea>
  );
}
