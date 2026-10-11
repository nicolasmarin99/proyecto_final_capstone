import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useEstadoPrestador, type EstadoPrestador } from "../prestador/ContextoPrestador";
import { clasesBoton } from "./Boton";
import { Icono, type NombreIcono } from "./iconos";

type Tono = "listo" | "pendiente" | "revision";

interface Seccion {
  ruta: string;
  texto: string;
  icono: NombreIcono;
  /** null mientras el estado todavía no llega. */
  estado: { texto: string; tono: Tono } | null;
}

const CLASES_TONO: Record<Tono, string> = {
  listo: "bg-exito-50 text-exito-700",
  pendiente: "bg-alerta-50 text-alerta-700",
  revision: "bg-hielo text-primario",
};

/** Las tres secciones del área, cada una con su estado en texto (el color solo no basta). */
function seccionesDe(estado: EstadoPrestador | null): Seccion[] {
  const listo = estado !== null && !estado.cargando;
  const identidad = estado?.identidad;

  return [
    {
      ruta: "/mi/perfil",
      texto: "Mi perfil",
      icono: "persona",
      estado: listo ? (estado.perfil ? { texto: "Completo", tono: "listo" } : { texto: "Pendiente", tono: "pendiente" }) : null,
    },
    {
      ruta: "/mi/servicios",
      texto: "Mis servicios",
      icono: "martillo",
      estado: listo
        ? estado.publicados > 0
          ? { texto: `${estado.publicados} ${estado.publicados === 1 ? "publicado" : "publicados"}`, tono: "listo" }
          : { texto: "Pendiente", tono: "pendiente" }
        : null,
    },
    {
      ruta: "/mi/identidad",
      texto: "Verificación de identidad",
      icono: "escudo",
      estado: listo
        ? identidad?.estado === "VERIFICADA"
          ? { texto: "Verificada", tono: "listo" }
          : identidad?.estado === "PENDIENTE"
            ? { texto: "En revisión", tono: "revision" }
            : identidad?.estado === "RECHAZADA"
              ? { texto: "Rechazada", tono: "pendiente" }
              : { texto: "Pendiente", tono: "pendiente" }
        : null,
    },
  ];
}

function ListaSecciones({ secciones, alElegir }: { secciones: Seccion[]; alElegir?(): void }) {
  return (
    <ul className="space-y-1">
      {secciones.map((seccion) => (
        <li key={seccion.ruta}>
          <NavLink
            to={seccion.ruta}
            onClick={alElegir}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-chico px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primario ${
                isActive ? "bg-hielo text-primario" : "text-noche hover:bg-niebla"
              }`
            }
          >
            <Icono nombre={seccion.icono} tamano={20} className="shrink-0" />
            <span className="min-w-0 flex-1">{seccion.texto}</span>
            {seccion.estado && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CLASES_TONO[seccion.estado.tono]}`}>
                {seccion.estado.texto}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

const ENFOCABLES = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Navegación del área en móvil: un botón que abre un panel modal.
 *
 * Mientras está abierto el foco queda atrapado dentro (Tab y Mayús+Tab dan
 * la vuelta), Escape o un clic en el fondo lo cierran, y al cerrar el foco
 * vuelve al botón que lo abrió.
 */
function NavegacionMovil({ secciones, actual }: { secciones: Seccion[]; actual: string | undefined }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;

    const enfocables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? []);
    enfocables()[0]?.focus();

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cerrar();
        return;
      }
      if (evento.key !== "Tab") return;

      const lista = enfocables();
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (!primero || !ultimo) return;

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    // Con el panel abierto, la página de atrás no se desplaza.
    const desbordeAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = desbordeAnterior;
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <div className="lg:hidden">
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto(true)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-medio border border-borde bg-blanco px-4 text-left text-sm font-semibold text-noche shadow-tarjeta focus-visible:outline-2 focus-visible:outline-primario"
      >
        <Icono nombre="menu" tamano={20} className="shrink-0 text-primario" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-texto-suave">Área del prestador</span>
          <span className="block truncate">{actual ?? "Secciones"}</span>
        </span>
        <Icono nombre="flechaAbajo" tamano={16} grosor={2} className="shrink-0 text-texto-suave" />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40">
          {/* El fondo es decorativo para el lector de pantalla: se cierra con Escape o con el botón. */}
          <div aria-hidden="true" onClick={cerrar} className="absolute inset-0 bg-noche/40" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            className="motion-safe:animate-aparecer-corto absolute inset-x-0 top-0 rounded-b-grande bg-blanco p-4 shadow-tarjeta-alta"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id={idTitulo} className="font-titulos text-base font-bold text-noche">
                Área del prestador
              </h2>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="flex size-11 cursor-pointer items-center justify-center rounded-chico text-noche hover:bg-niebla focus-visible:outline-2 focus-visible:outline-primario"
              >
                <Icono nombre="cerrar" tamano={20} />
              </button>
            </div>
            <nav aria-label="Área del prestador">
              <ListaSecciones secciones={secciones} alElegir={cerrar} />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Área del prestador: navegación propia (lateral en escritorio, botón en
 * móvil) y la sección elegida a la derecha.
 */
export function AreaPrestador() {
  const estado = useEstadoPrestador();
  const { pathname } = useLocation();
  const secciones = seccionesDe(estado);
  const actual = secciones.find((seccion) => pathname.startsWith(seccion.ruta))?.texto;

  return (
    <div className="flex-1 bg-niebla">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:px-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:py-10">
        <aside className="hidden lg:block">
          <nav aria-label="Área del prestador" className="sticky top-6 rounded-grande border border-borde bg-blanco p-3 shadow-tarjeta">
            <p className="px-3 pt-1 pb-2 text-xs font-bold tracking-[1.2px] text-texto-suave uppercase">Área del prestador</p>
            <ListaSecciones secciones={secciones} />
          </nav>
        </aside>

        <NavegacionMovil secciones={secciones} actual={actual} />

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Llamado a completar el perfil, en lugar de lo que todavía no se puede
 * hacer sin él (la API rechaza la cédula y los servicios de quien no lo tiene).
 */
export function CompletarPerfilPrimero({ motivo }: { motivo: string }) {
  return (
    <div className="mt-6 rounded-medio border border-borde bg-hielo/60 p-5 text-sm leading-relaxed text-noche">
      <p className="font-semibold">Primero completa tu perfil.</p>
      <p className="mt-1 text-texto-suave">{motivo}</p>
      <Link to="/mi/perfil" className={`mt-4 sm:w-auto! sm:px-6 ${clasesBoton("principal")}`}>
        Completar perfil
      </Link>
    </div>
  );
}

/** Tarjeta de cada sección del área: título, bajada opcional y contenido. */
export function SeccionArea({
  titulo,
  bajada,
  accion,
  children,
}: {
  titulo: string;
  bajada?: string;
  /** Botón o enlace junto al título, como «Publicar servicio». */
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="motion-safe:animate-aparecer rounded-grande border border-borde bg-blanco p-5 shadow-tarjeta sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-titulos text-titulo font-bold tracking-[-0.5px] text-noche">{titulo}</h1>
          {bajada && <p className="mt-1 text-sm leading-relaxed text-texto-suave">{bajada}</p>}
        </div>
        {accion}
      </div>
      {children}
    </div>
  );
}
