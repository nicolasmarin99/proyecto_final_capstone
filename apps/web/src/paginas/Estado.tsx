import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Pagina } from "../componentes/Pagina";

const AVISO_DESPERTANDO_MS = 5000;
const TIEMPO_LIMITE_MS = 70000;

interface RespuestaSalud {
  estado: string;
  baseDatos: string;
  entorno?: string;
}

type Estado =
  | { tipo: "cargando" }
  | { tipo: "ok"; datos: RespuestaSalud }
  | { tipo: "degradado"; datos: RespuestaSalud }
  | { tipo: "error" };

export default function PaginaEstado() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [avisoDespertando, setAvisoDespertando] = useState(false);
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const controlador = new AbortController();

    const timeoutAviso = setTimeout(() => {
      if (!cancelado) setAvisoDespertando(true);
    }, AVISO_DESPERTANDO_MS);

    const timeoutLimite = setTimeout(() => {
      controlador.abort();
    }, TIEMPO_LIMITE_MS);

    // Ruta relativa: la resuelve el proxy de Vite o las reescrituras de Vercel.
    fetch("/api/health", { signal: controlador.signal })
      .then(async (respuesta) => {
        const datos = (await respuesta.json()) as RespuestaSalud;
        if (cancelado) return;
        setEstado(respuesta.ok ? { tipo: "ok", datos } : { tipo: "degradado", datos });
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ tipo: "error" });
      })
      .finally(() => {
        clearTimeout(timeoutAviso);
        clearTimeout(timeoutLimite);
        if (!cancelado) setAvisoDespertando(false);
      });

    return () => {
      cancelado = true;
      controlador.abort();
      clearTimeout(timeoutAviso);
      clearTimeout(timeoutLimite);
    };
  }, [intentos]);

  function reintentar() {
    setEstado({ tipo: "cargando" });
    setAvisoDespertando(false);
    setIntentos((n) => n + 1);
  }

  return (
    <Pagina titulo="Estado del servidor">
      <div className="mt-6" role="status" aria-live="polite">
        {estado.tipo === "cargando" && (
          <div className="rounded-lg bg-slate-100 p-4 text-slate-700">
            <p>Cargando…</p>
            {avisoDespertando && (
              <p className="mt-2 text-sm text-slate-500">
                El servidor se está despertando, esto puede tardar hasta un minuto.
              </p>
            )}
          </div>
        )}

        {estado.tipo === "ok" && (
          <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
            <p className="font-semibold">Todo OK</p>
            <p className="mt-1 text-sm">API: {estado.datos.estado}</p>
            <p className="text-sm">Base de datos: {estado.datos.baseDatos}</p>
            {estado.datos.entorno && <p className="text-sm">Entorno: {estado.datos.entorno}</p>}
          </div>
        )}

        {estado.tipo === "degradado" && (
          <div className="rounded-lg bg-amber-50 p-4 text-amber-800">
            <p className="font-semibold">Servicio degradado</p>
            <p className="mt-1 text-sm">API: {estado.datos.estado}</p>
            <p className="text-sm">Base de datos: {estado.datos.baseDatos}</p>
          </div>
        )}

        {estado.tipo === "error" && (
          <div className="rounded-lg bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Sin conexión con el servidor</p>
            <p className="mt-1 text-sm">No fue posible contactar la API.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={reintentar}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Reintentar
      </button>

      <nav className="mt-6 flex justify-center gap-4 border-t border-slate-200 pt-4 text-sm">
        <Link to="/registro" className="font-medium text-slate-700 underline hover:text-slate-900">
          Crear cuenta
        </Link>
        <Link
          to="/iniciar-sesion"
          className="font-medium text-slate-700 underline hover:text-slate-900"
        >
          Iniciar sesión
        </Link>
        <Link to="/perfil" className="font-medium text-slate-700 underline hover:text-slate-900">
          Mi perfil
        </Link>
      </nav>
    </Pagina>
  );
}
