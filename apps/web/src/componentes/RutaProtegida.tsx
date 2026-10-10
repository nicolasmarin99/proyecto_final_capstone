import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../auth/ContextoAuth";
import { clasesBoton } from "./Boton";
import { Pagina } from "./Pagina";

const NOMBRE_ROL: Record<string, string> = {
  CLIENTE: "clientes",
  PRESTADOR: "prestadores",
  ADMINISTRADOR: "administradores",
};

/**
 * Mientras se restaura la sesión no se puede decidir nada: si redirigiera de
 * inmediato, al recargar /perfil el usuario saldría disparado a iniciar sesión
 * aunque su cookie fuera válida.
 *
 * `roles` limita la página a ciertos roles. Es comodidad, no seguridad: le
 * evita a un cliente un formulario que la API le rechazaría con 403. Quien lo
 * impide de verdad es autorizar() en el servidor.
 */
export function RutaProtegida({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <Pagina titulo="Cargando">
        <p className="mt-6 text-sm text-texto-suave">Verificando tu sesión…</p>
      </Pagina>
    );
  }

  if (!usuario) {
    return <Navigate to="/iniciar-sesion" replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    // Se explica en vez de redirigir: un salto silencioso a otra página hace
    // pensar que el enlace está roto.
    const destinatarios = roles.map((rol) => NOMBRE_ROL[rol] ?? rol).join(" y ");

    return (
      <Pagina titulo="Esta página no es para tu cuenta">
        <p className="mt-4 text-[15px] leading-relaxed text-texto-suave">
          Esta sección es solo para {destinatarios}.
        </p>
        <Link to="/perfil" className={`mt-6 ${clasesBoton("secundario")}`}>
          Volver a mi perfil
        </Link>
      </Pagina>
    );
  }

  return <>{children}</>;
}
