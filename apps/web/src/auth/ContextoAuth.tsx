import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clienteApi, type ClienteApi, type Usuario } from "../api/cliente";
import { ProveedorEstadoPrestador } from "../prestador/ContextoPrestador";

interface ValorContexto {
  usuario: Usuario | null;
  /**
   * El cliente de la API de esta sesión. Lo usan los componentes globales
   * (encabezado, estado del prestador) que no reciben uno por props: así las
   * pruebas que inyectan su propio cliente lo inyectan también ahí.
   */
  cliente: ClienteApi;
  /** true mientras se intenta restaurar la sesión al arrancar la aplicación. */
  cargando: boolean;
  iniciarSesion(correo: string, contrasena: string): Promise<void>;
  cerrarSesion(): Promise<void>;
}

const Contexto = createContext<ValorContexto | null>(null);

interface Props {
  children: ReactNode;
  /** Inyectable para que cada prueba use un cliente con su propio estado. */
  cliente?: ClienteApi;
}

export function ProveedorAuth({ children, cliente = clienteApi }: Props) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    // El token de acceso se perdió al recargar, pero la cookie httpOnly sigue
    // ahí: se cambia por una sesión nueva. Si StrictMode ejecuta este efecto
    // dos veces, el cliente comparte una sola promesa de refresco, así que la
    // API recibe una única petición.
    cliente
      .restaurarSesion()
      .then((restaurado) => {
        if (cancelado) {
          return;
        }

        // Actualización funcional a propósito: si el usuario alcanzó a
        // iniciar sesión mientras este refresco estaba en curso, el resultado
        // de la restauración es información vieja y no debe pisarla.
        setUsuario((actual) => actual ?? restaurado);
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });

    return () => {
      // Solo evita actualizar el estado de un componente desmontado; no
      // cancela el refresco, que debe completarse para el resto de la app.
      cancelado = true;
    };
  }, [cliente]);

  const iniciarSesion = useCallback(
    async (correo: string, contrasena: string) => {
      setUsuario(await cliente.iniciarSesion(correo, contrasena));
    },
    [cliente],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await cliente.cerrarSesion();
    } finally {
      // Aunque la llamada a la API falle, en el navegador la sesión termina:
      // dejar el usuario puesto mostraría una sesión que ya no existe.
      setUsuario(null);
    }
  }, [cliente]);

  const valor = useMemo(
    () => ({ usuario, cliente, cargando, iniciarSesion, cerrarSesion }),
    [usuario, cliente, cargando, iniciarSesion, cerrarSesion],
  );

  // El estado del prestador vive dentro: depende de quién inició sesión, y
  // así quien monta ProveedorAuth (la app o una prueba) lo obtiene sin más.
  return (
    <Contexto.Provider value={valor}>
      <ProveedorEstadoPrestador>{children}</ProveedorEstadoPrestador>
    </Contexto.Provider>
  );
}

export function useAuth(): ValorContexto {
  const valor = useContext(Contexto);

  if (!valor) {
    throw new Error("useAuth debe usarse dentro de ProveedorAuth.");
  }

  return valor;
}
