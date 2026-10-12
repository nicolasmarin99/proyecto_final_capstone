import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth/ContextoAuth";
import { Contenedor } from "./landing/Contenedor";
import { Icono } from "./iconos";
import { LogoLocalCL } from "./LogoLocalCL";
import { MenuUsuario } from "./MenuUsuario";

const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario";

/** Secciones de la landing: solo se muestran estando en ella, y desde lg. */
const SECCIONES_LANDING = [
  { href: "#servicios", texto: "Servicios" },
  { href: "#como-funciona", texto: "Cómo funciona" },
  { href: "#prestadores", texto: "Para prestadores" },
];

/**
 * Encabezado persistente de toda la aplicación.
 *
 * Sin sesión: la marca y los enlaces para entrar o registrarse.
 * Con sesión: la marca y el menú del usuario con su nombre y su rol.
 * Mientras se restaura la sesión no muestra ninguno de los dos, para no
 * mostrar «Iniciar sesión» un instante a quien ya tiene sesión.
 *
 * «Buscar» es para quien contrata: visitantes y clientes. Al prestador y al
 * administrador no se les ofrece, porque su menú ya lleva a lo suyo.
 */
export function Encabezado() {
  const { usuario, cargando } = useAuth();
  const { pathname } = useLocation();
  const ofreceBuscar = !cargando && (!usuario || usuario.rol === "CLIENTE");

  return (
    <header className="relative z-20 border-b border-borde bg-blanco">
      <Contenedor className="flex h-[72px] items-center justify-between gap-4">
        <Link to="/" className={`shrink-0 rounded-chico ${foco}`}>
          <LogoLocalCL tamano={36} claseTexto="hidden text-xl font-bold tracking-[-0.5px] text-noche min-[400px]:inline" />
          <span className="sr-only min-[400px]:hidden">LocalCL, ir al inicio</span>
        </Link>

        {pathname === "/" && (
          <nav aria-label="Secciones de la portada" className="hidden items-center gap-8 font-medium lg:flex">
            {SECCIONES_LANDING.map((seccion) => (
              <a key={seccion.href} href={seccion.href} className={`rounded-sm text-noche hover:text-primario ${foco}`}>
                {seccion.texto}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-1 sm:gap-3">
          {ofreceBuscar && (
            <Link
              to="/buscar"
              aria-current={pathname === "/buscar" ? "page" : undefined}
              className={`flex h-11 items-center gap-2 rounded-chico px-2.5 text-sm font-semibold text-noche transition-colors hover:bg-niebla hover:text-primario aria-[current=page]:text-primario sm:px-4 sm:text-[15px] ${foco}`}
            >
              <Icono nombre="lupa" tamano={20} grosor={2} className="shrink-0" />
              {/* En el celular queda el ícono; el nombre sigue ahí para el lector de pantalla. */}
              <span className="sr-only sm:not-sr-only">Buscar</span>
            </Link>
          )}
          {!cargando &&
            (usuario ? (
              <MenuUsuario usuario={usuario} />
            ) : (
              <nav aria-label="Cuenta" className="flex items-center gap-1.5 sm:gap-3">
                <Link
                  to="/iniciar-sesion"
                  className={`flex h-11 items-center rounded-chico px-3 text-sm font-semibold text-primario transition-colors hover:bg-hielo sm:px-5 sm:text-[15px] ${foco}`}
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/registro"
                  className={`flex h-11 items-center rounded-chico bg-primario px-4 text-sm font-bold text-blanco transition-colors hover:bg-noche sm:px-5 sm:text-[15px] ${foco}`}
                >
                  Registrarse
                </Link>
              </nav>
            ))}
        </div>
      </Contenedor>
    </header>
  );
}

/**
 * Layout de todas las rutas: encabezado arriba y la página debajo, ocupando
 * el resto del alto (las páginas usan flex-1 en vez de min-h-screen).
 */
export function ConEncabezado() {
  return (
    <div className="flex min-h-screen flex-col">
      <Encabezado />
      <Outlet />
    </div>
  );
}
