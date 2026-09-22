import { useEffect, useState } from "react";
import { API_URL } from "./config";

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

export default function App() {
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

    fetch(`${API_URL}/health`, { signal: controlador.signal })
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">LocalCL</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Estado del servidor</h1>

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
      </div>
    </main>
  );
}
