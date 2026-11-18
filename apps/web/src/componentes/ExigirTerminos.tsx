import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth/ContextoAuth";

/**
 * Una cuenta con sesión que no aceptó los términos vigentes va a
 * /aceptar-terminos desde cualquier página, y vuelve a donde estaba al
 * aceptar. Sin sesión no cambia nada: las páginas públicas siguen abiertas.
 *
 * Es comodidad, no la protección: quien rechaza de verdad es autenticar()
 * en la API, que responde TERMINOS_PENDIENTES a toda ruta con sesión.
 */
export function ExigirTerminos() {
  const { usuario } = useAuth();
  const ubicacion = useLocation();

  if (usuario?.terminosPendientes) {
    return <Navigate to="/aceptar-terminos" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  }
  return <Outlet />;
}
