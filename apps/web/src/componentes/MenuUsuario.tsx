import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Usuario } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { useEstadoPrestador } from "../prestador/ContextoPrestador";
import { Icono } from "./iconos";

export const NOMBRE_ROL: Record<string, string> = {
  CLIENTE: "Cliente",
  PRESTADOR: "Prestador",
  ADMINISTRADOR: "Administrador",
};

interface Opcion {
  texto: string;
  ruta: string;
}

/** Las opciones dependen del rol y, para el prestador, de si completó su perfil. */
function opcionesPara(usuario: Usuario, tienePerfil: boolean | null): Opcion[] {
  const opciones: Opcion[] = [{ texto: "Mi cuenta", ruta: "/perfil" }];

  if (usuario.rol === "PRESTADOR" && tienePerfil === false) {
    opciones.push({ texto: "Completar perfil", ruta: "/mi/perfil" });
  }
  if (usuario.rol === "PRESTADOR" && tienePerfil === true) {
    opciones.push({ texto: "Mi perfil", ruta: "/mi/perfil" }, { texto: "Mis servicios", ruta: "/mi/servicios" });
  }
  if (usuario.rol === "ADMINISTRADOR") {
    opciones.push({ texto: "Panel de administración", ruta: "/admin" });
  }

  return opciones;
}

const clasesOpcion =
  "flex w-full min-h-11 cursor-pointer items-center rounded-chico px-3 text-left text-sm font-medium text-noche " +
  "hover:bg-niebla focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primario";

/**
 * Menú del usuario conectado (patrón disclosure: botón + lista de enlaces).
 *
 * - aria-expanded refleja si está abierto; aria-controls apunta a la lista.
 * - Escape lo cierra y devuelve el foco al botón.
 * - Un clic fuera lo cierra. Si el foco estaba dentro, vuelve al botón;
 *   si no, se respeta dónde hizo clic la persona.
 * - Salir con Tab lo cierra: un menú abierto que ya no tiene el foco tapa
 *   el contenido sin que nadie lo esté usando.
 */
export function MenuUsuario({ usuario }: { usuario: Usuario }) {
  const navegar = useNavigate();
  const { cerrarSesion } = useAuth();
  const estado = useEstadoPrestador();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idLista = useId();

  const tienePerfil = estado ? (estado.cargando ? null : estado.perfil !== null) : null;
  const opciones = opcionesPara(usuario, tienePerfil);

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar(true);
    };
    const alPresionar = (evento: MouseEvent) => {
      if (evento.target instanceof Node && !contenedor.current?.contains(evento.target)) {
        const focoDentro = contenedor.current?.contains(document.activeElement) ?? false;
        cerrar(focoDentro);
      }
    };

    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alPresionar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alPresionar);
    };
  }, [abierto]);

  async function salir() {
    cerrar(false);
    // Se navega antes de limpiar la sesión: al revés, una ruta protegida
    // vería el usuario en null y mandaría a iniciar sesión.
    navegar("/", { replace: true });
    await cerrarSesion();
  }

  const rol = NOMBRE_ROL[usuario.rol] ?? usuario.rol;
  const inicial = usuario.nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      ref={contenedor}
      className="relative"
      onBlur={(evento) => {
        // El foco salió del menú entero (no solo pasó de un enlace a otro).
        if (abierto && !evento.currentTarget.contains(evento.relatedTarget)) setAbierto(false);
      }}
    >
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={idLista}
        onClick={() => setAbierto((actual) => !actual)}
        className="flex min-h-11 max-w-[220px] cursor-pointer items-center gap-2.5 rounded-boton py-1 pr-2 pl-1 text-left hover:bg-niebla focus-visible:outline-2 focus-visible:outline-primario sm:max-w-[280px]"
      >
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-hielo font-titulos font-bold text-primario">
          {inicial}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-noche">{usuario.nombre}</span>
          <span className="block text-xs text-texto-suave">{rol}</span>
        </span>
        <Icono nombre="flechaAbajo" tamano={16} grosor={2} className={`shrink-0 text-texto-suave transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div
          id={idLista}
          className="motion-safe:animate-aparecer-corto absolute top-full right-0 z-30 mt-2 w-64 rounded-medio border border-borde bg-blanco p-2 shadow-tarjeta"
        >
          <ul className="space-y-0.5">
            {opciones.map((opcion) => (
              <li key={opcion.ruta + opcion.texto}>
                <Link to={opcion.ruta} onClick={() => cerrar(false)} className={clasesOpcion}>
                  {opcion.texto}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-borde pt-1">
            <button type="button" onClick={salir} className={clasesOpcion}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
