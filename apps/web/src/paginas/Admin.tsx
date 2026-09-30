import { useEffect, useState } from "react";
import { Link } from "react-router";
import { clasesBoton } from "../componentes/Boton";
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
            className="rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {error}
          </p>
        )}

        {!error && !resumen && <p className="text-sm text-texto-suave">Cargando el resumen…</p>}

        {resumen && (
          <>
            <div className="rounded-chico bg-noche p-5">
              <p className="text-sm text-noche-texto">Usuarios registrados</p>
              <p className="font-titulos text-display font-bold text-blanco">
                {resumen.totalUsuarios}
              </p>
            </div>

            <dl className="mt-4 rounded-chico border border-borde bg-niebla p-4 text-sm">
              {Object.entries(resumen.porRol).map(([rol, total]) => (
                <div key={rol} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-texto-suave">{rol}</dt>
                  <dd className="font-medium text-noche">{total}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      <Link
        to="/perfil"
        className={`mt-6 ${clasesBoton("secundario")}`}
      >
        Volver a mi perfil
      </Link>
    </Pagina>
  );
}
