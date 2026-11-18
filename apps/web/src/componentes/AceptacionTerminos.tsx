import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { ClienteApi } from "../api/cliente";

const clasesEnlace = "font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2 hover:text-noche";

/**
 * La versión vigente de los términos, para enviarla con la aceptación: la API
 * exige que se acepte la que la persona tuvo en pantalla. null mientras carga;
 * error si no se pudo obtener (sin versión no se puede aceptar).
 */
export function useVersionTerminos(cliente: ClienteApi) {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Sube si la API dice que la versión cambió mientras se llenaba el formulario.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setError(false);
    cliente
      .obtenerTerminosVigentes()
      .then((terminos) => {
        if (!cancelado) setVersion(terminos.version);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, recarga]);

  return { version, error, recargar: () => setRecarga((actual) => actual + 1) };
}

function Casilla({
  id,
  marcada,
  alCambiar,
  error,
  children,
}: {
  id: string;
  marcada: boolean;
  alCambiar(marcada: boolean): void;
  error?: string;
  children: ReactNode;
}) {
  const idError = `${id}-error`;
  return (
    <div className="mt-4">
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={marcada}
          onChange={(evento) => alCambiar(evento.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primario"
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed text-noche">
          {children}
        </label>
      </div>
      {error && (
        <p id={idError} role="alert" className="mt-1.5 pl-8 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Las dos casillas del registro, iguales para clientes y prestadores. No
 * vienen marcadas: la aceptación tiene que ser un acto expreso de la persona.
 * Los enlaces abren el documento en otra pestaña para no perder lo escrito.
 */
export function AceptacionTerminos({
  aceptaTerminos,
  alCambiarTerminos,
  mayorDeEdad,
  alCambiarMayorDeEdad,
  errores,
  version,
  sinVersion,
}: {
  aceptaTerminos: boolean;
  alCambiarTerminos(marcada: boolean): void;
  mayorDeEdad: boolean;
  alCambiarMayorDeEdad(marcada: boolean): void;
  errores: { aceptaTerminos?: string; mayorDeEdad?: string };
  /** La versión que se está aceptando; null mientras carga. */
  version: string | null;
  sinVersion: boolean;
}) {
  return (
    <fieldset className="mt-6 min-w-0 rounded-medio border border-borde p-4">
      <legend className="px-1 text-sm font-bold text-noche">Antes de crear tu cuenta</legend>
      {version && <p className="text-xs text-texto-suave">Términos vigentes: versión {version}.</p>}
      {sinVersion && (
        <p role="alert" className="text-sm font-medium text-error-700">
          No pudimos cargar los términos y condiciones. Recarga la página para intentarlo de nuevo.
        </p>
      )}
      <Casilla id="aceptaTerminos" marcada={aceptaTerminos} alCambiar={alCambiarTerminos} error={errores.aceptaTerminos}>
        Leí y acepto los{" "}
        <Link to="/terminos" target="_blank" rel="noopener" className={clasesEnlace}>
          Términos y condiciones
        </Link>{" "}
        y la{" "}
        <Link to="/terminos#privacidad" target="_blank" rel="noopener" className={clasesEnlace}>
          Política de privacidad
        </Link>{" "}
        de LocalCL.
      </Casilla>
      <Casilla id="mayorDeEdad" marcada={mayorDeEdad} alCambiar={alCambiarMayorDeEdad} error={errores.mayorDeEdad}>
        Declaro ser mayor de 18 años.
      </Casilla>
    </fieldset>
  );
}

/**
 * Revisa las casillas antes de enviar, con los mismos mensajes que la API.
 * Sin la versión cargada no se puede aceptar: se dice bajo la casilla.
 */
export function erroresAceptacion(aceptaTerminos: boolean, mayorDeEdad: boolean, version: string | null): Record<string, string> {
  return {
    ...(aceptaTerminos ? {} : { aceptaTerminos: "Debes aceptar los términos y condiciones y la política de privacidad." }),
    ...(aceptaTerminos && !version ? { aceptaTerminos: "Todavía no cargan los términos. Espera un momento o recarga la página." } : {}),
    ...(mayorDeEdad ? {} : { mayorDeEdad: "Debes ser mayor de 18 años para crear una cuenta." }),
  };
}
