import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EstadoIdentidad, PerfilPrestador, RequisitoPendiente } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";

export interface EstadoPrestador {
  /** true mientras llega la primera respuesta. */
  cargando: boolean;
  /** null si todavía no completa su perfil. */
  perfil: PerfilPrestador | null;
  /** null si nunca subió su cédula; undefined si no se pudo consultar. */
  identidad: EstadoIdentidad | null | undefined;
  totalServicios: number;
  publicados: number;
  /** Lo que la API dice que falta para publicar (identidad, comunas). */
  requisitos: RequisitoPendiente[];
  /** Vuelve a consultar todo. Se llama después de cambiar perfil, identidad o servicios. */
  recargar(): Promise<void>;
}

const Contexto = createContext<EstadoPrestador | null>(null);

const VACIO = { perfil: null, identidad: null, totalServicios: 0, publicados: 0, requisitos: [] };

/**
 * Estado del prestador que comparten el encabezado, el lateral del área y
 * las páginas: si tiene perfil, cómo va su identidad y sus servicios.
 *
 * Una sola fuente evita que el menú diga «Completar perfil» mientras la
 * página ya muestra el perfil guardado. Solo consulta la API si quien inició
 * sesión es PRESTADOR; para el resto el valor es null.
 */
export function ProveedorEstadoPrestador({ children }: { children: ReactNode }) {
  const { usuario, cliente } = useAuth();
  const esPrestador = usuario?.rol === "PRESTADOR";
  const [datos, setDatos] = useState<Omit<EstadoPrestador, "cargando" | "recargar">>(VACIO);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!esPrestador) return;

    const [perfil, identidad] = await Promise.allSettled([
      cliente.obtenerMiPerfilPrestador(),
      cliente.obtenerMiIdentidad(),
    ]);
    const perfilLeido = perfil.status === "fulfilled" ? perfil.value : null;

    // Sin perfil, /servicios/mios responde 409: no tiene sentido preguntar.
    const servicios = perfilLeido
      ? await cliente.listarMisServicios().catch(() => null)
      : null;

    setDatos({
      perfil: perfilLeido,
      identidad: identidad.status === "fulfilled" ? identidad.value.identidad : undefined,
      totalServicios: servicios?.servicios.length ?? 0,
      publicados: servicios?.servicios.filter((servicio) => servicio.estado === "PUBLICADO").length ?? 0,
      requisitos: servicios?.requisitosPendientes ?? [],
    });
    setCargando(false);
  }, [cliente, esPrestador]);

  useEffect(() => {
    setDatos(VACIO);
    setCargando(true);
    void recargar();
    // usuario?.id: al cambiar de cuenta, se vuelve a consultar desde cero.
  }, [recargar, usuario?.id]);

  const valor = useMemo(() => ({ ...datos, cargando, recargar }), [datos, cargando, recargar]);

  return <Contexto.Provider value={esPrestador ? valor : null}>{children}</Contexto.Provider>;
}

/** Estado del prestador conectado, o null si no hay un prestador conectado. */
export function useEstadoPrestador(): EstadoPrestador | null {
  return useContext(Contexto);
}
