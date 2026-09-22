import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/ContextoAuth";
import { Pagina } from "./Pagina";

/**
 * Mientras se restaura la sesión no se puede decidir nada: si redirigiera de
 * inmediato, al recargar /perfil el usuario saldría disparado a iniciar sesión
 * aunque su cookie fuera válida.
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <Pagina titulo="Cargando">
        <p className="mt-6 text-sm text-slate-600">Verificando tu sesión…</p>
      </Pagina>
    );
  }

  if (!usuario) {
    return <Navigate to="/iniciar-sesion" replace />;
  }

  return <>{children}</>;
}
