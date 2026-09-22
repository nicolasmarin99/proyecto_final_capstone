import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { clienteApi, type ClienteApi, type Usuario } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Pagina } from "../componentes/Pagina";

export default function PaginaPerfil({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const { cerrarSesion } = useAuth();
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let cancelado = false;

    // Se pide a la API en vez de usar lo que ya tiene el contexto: es el dato
    // vigente, y de paso comprueba que la sesión siga siendo válida.
    cliente
      .obtenerPerfil()
      .then((usuario) => {
        if (!cancelado) setPerfil(usuario);
      })
      .catch(() => {
        if (!cancelado) setError("No fue posible cargar tu perfil.");
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  async function alCerrarSesion() {
    setSaliendo(true);
    // Se navega antes de limpiar la sesión. Al revés, RutaProtegida vería el
    // usuario en null mientras esta página sigue montada y redirigiría a
    // iniciar sesión en vez de volver al inicio.
    navegar("/", { replace: true });
    await cerrarSesion();
  }

  return (
    <Pagina titulo="Mi perfil">
      <div className="mt-6">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!error && !perfil && <p className="text-sm text-slate-600">Cargando tu perfil…</p>}

        {perfil && (
          <dl className="rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Nombre</dt>
              <dd className="font-medium text-slate-900">{perfil.nombre}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-slate-500">Correo</dt>
              <dd className="font-medium text-slate-900">{perfil.correo}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-slate-500">Rol</dt>
              <dd className="font-medium text-slate-900">{perfil.rol}</dd>
            </div>
          </dl>
        )}
      </div>

      <button
        type="button"
        onClick={alCerrarSesion}
        disabled={saliendo}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </Pagina>
  );
}
