import { useAuth } from "../../auth/ContextoAuth";
import { CompletarPerfilPrimero, SeccionArea } from "../../componentes/AreaPrestador";
import { VerificacionIdentidad } from "../../componentes/VerificacionIdentidad";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";

/** /mi/identidad: la carga de la cédula, en su propia sección. */
export default function PaginaMiIdentidad() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();

  return (
    <SeccionArea
      titulo="Verificación de identidad"
      bajada="Cuando revisemos tu cédula, tus servicios podrán publicarse y los clientes sabrán que eres quien dices ser."
    >
      {estado === null || estado.cargando ? (
        <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil…</p>
      ) : estado.perfil === null ? (
        <CompletarPerfilPrimero motivo="Necesitamos tus datos de prestador antes de revisar tu cédula." />
      ) : (
        <div className="max-w-xl">
          <VerificacionIdentidad cliente={cliente} alSubir={() => void estado.recargar()} />
        </div>
      )}
    </SeccionArea>
  );
}
