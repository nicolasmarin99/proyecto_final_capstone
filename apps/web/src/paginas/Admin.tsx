import { useEffect, useState } from "react";
import { Link } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi, type ResumenAdmin } from "../api/cliente";
import { Pagina } from "../componentes/Pagina";

export default function PaginaAdmin({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const [resumen, setResumen] = useState<ResumenAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    cliente
      .obtenerResumenAdmin()
      .then((datos) => {
        if (!cancelado) setResumen(datos);
      })
      .catch((causa: unknown) => {
        if (cancelado) return;

        // Si alguien llega hasta aquí sin ser administrador, el 403 lo decide
        // el servidor. La interfaz solo traduce esa respuesta a un mensaje.
        setError(
          causa instanceof ErrorApi && causa.estado === 403
            ? "No tienes permisos para ver este panel."
            : "No fue posible cargar el resumen.",
        );
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  return (
    <Pagina titulo="Panel de administración">
      <div className="mt-6">
        {error && (
          <p
            role="alert"
            className="rounded-campo border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {error}
          </p>
        )}

        {!error && !resumen && <p className="text-sm text-piedra-500">Cargando el resumen…</p>}

        {resumen && (
          <>
            <div className="rounded-campo bg-marca-900 p-5">
              <p className="text-sm text-marca-200">Usuarios registrados</p>
              <p className="font-display text-display font-semibold text-white">
                {resumen.totalUsuarios}
              </p>
            </div>

            <dl className="mt-4 rounded-campo border border-piedra-100 bg-piedra-50 p-4 text-sm">
              {Object.entries(resumen.porRol).map(([rol, total]) => (
                <div key={rol} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-piedra-500">{rol}</dt>
                  <dd className="font-medium text-marca-900">{total}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      <Link
        to="/perfil"
        className="mt-6 flex min-h-12 items-center justify-center rounded-campo border border-piedra-300 px-4 text-sm font-semibold text-marca-900 transition hover:bg-piedra-50"
      >
        Volver a mi perfil
      </Link>
    </Pagina>
  );
}
