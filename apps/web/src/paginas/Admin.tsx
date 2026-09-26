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
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!error && !resumen && <p className="text-sm text-slate-600">Cargando el resumen…</p>}

        {resumen && (
          <>
            <div className="rounded-lg bg-slate-900 p-4 text-white">
              <p className="text-sm text-slate-300">Usuarios registrados</p>
              <p className="text-2xl font-bold">{resumen.totalUsuarios}</p>
            </div>

            <dl className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
              {Object.entries(resumen.porRol).map(([rol, total]) => (
                <div key={rol} className="flex justify-between gap-4 py-1">
                  <dt className="text-slate-500">{rol}</dt>
                  <dd className="font-medium text-slate-900">{total}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      <Link
        to="/perfil"
        className="mt-6 block rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Volver a mi perfil
      </Link>
    </Pagina>
  );
}
