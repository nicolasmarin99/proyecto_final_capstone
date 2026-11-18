import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi, type Terminos } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "../componentes/Boton";
import { DocumentoLegal } from "../componentes/DocumentoLegal";
import { Pagina } from "../componentes/Pagina";

/**
 * /aceptar-terminos: para una cuenta con sesión que todavía no aceptó la
 * versión vigente (creada antes de esta regla, o ante una versión nueva).
 * ExigirTerminos la trae aquí desde cualquier otra página; la API, mientras
 * tanto, rechaza todo con TERMINOS_PENDIENTES.
 */
export default function PaginaAceptarTerminos({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const { usuario, cargando, aceptarTerminos, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const idTitulo = useId();
  const [terminos, setTerminos] = useState<Terminos | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [errorCasilla, setErrorCasilla] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const desde = (ubicacion.state as { desde?: string } | null)?.desde ?? "/";

  // Sube cuando la versión cambió mientras se leía: se vuelve a pedir la vigente.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setErrorCarga(false);
    cliente
      .obtenerTerminosVigentes()
      .then((vigentes) => {
        if (!cancelado) setTerminos(vigentes);
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, recarga]);

  if (cargando) {
    return (
      <Pagina titulo="Cargando">
        <p className="mt-6 text-sm text-texto-suave">Verificando tu sesión…</p>
      </Pagina>
    );
  }
  // Quien eligió no aceptar y cerrar sesión vuelve al inicio, no a iniciar sesión.
  if (!usuario) return <Navigate to={saliendo ? "/" : "/iniciar-sesion"} replace />;
  if (!usuario.terminosPendientes) return <Navigate to={desde} replace />;

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    if (!acepta) {
      setErrorCasilla("Debes aceptar los términos y condiciones y la política de privacidad para continuar.");
      return;
    }
    if (!terminos) return;
    setEnviando(true);
    try {
      await aceptarTerminos(terminos.version);
      navegar(desde, { replace: true });
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.codigo === "TERMINOS_DESACTUALIZADOS") {
        // Cambiaron mientras los leía: se muestra la versión nueva y se vuelve a pedir la casilla.
        setAcepta(false);
        setErrorGeneral(causa.message);
        setRecarga((actual) => actual + 1);
      } else {
        setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pagina titulo="Actualizamos nuestros términos" ancho="amplio">
      <p className="mt-3 text-[15px] leading-relaxed text-texto-suave">
        Para seguir usando LocalCL necesitamos que leas y aceptes los términos y condiciones y la política de privacidad vigentes. Explican qué
        datos tuyos tratamos, para qué y cuáles son tus derechos.
      </p>

      {errorCarga && (
        <p role="alert" className="mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          No fue posible cargar los términos. Recarga la página para intentarlo de nuevo.
        </p>
      )}
      {!errorCarga && !terminos && <p className="mt-4 text-sm text-texto-suave">Cargando los términos…</p>}

      {terminos && (
        <form onSubmit={(evento) => void alEnviar(evento)} noValidate aria-labelledby={idTitulo}>
          <section
            aria-labelledby={idTitulo}
            tabIndex={0}
            className="mt-5 max-h-[55vh] overflow-y-auto rounded-medio border border-borde bg-niebla p-4 focus-visible:outline-2 focus-visible:outline-primario sm:p-6"
          >
            <h2 id={idTitulo} className="sr-only">
              Términos y condiciones y Política de privacidad, versión {terminos.version}
            </h2>
            <DocumentoLegal contenido={terminos.contenido} nivelTitulo={2} />
          </section>
          <p className="mt-2 text-xs text-texto-suave">
            También puedes leerlos en{" "}
            <Link to="/terminos" target="_blank" rel="noopener" className="font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2">
              una página aparte
            </Link>{" "}
            para imprimirlos o guardarlos.
          </p>

          <div className="mt-5 flex items-start gap-3">
            <input
              id="aceptaTerminos"
              type="checkbox"
              checked={acepta}
              onChange={(evento) => {
                setAcepta(evento.target.checked);
                setErrorCasilla(null);
              }}
              aria-invalid={errorCasilla ? true : undefined}
              aria-describedby={errorCasilla ? "aceptaTerminos-error" : undefined}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primario"
            />
            <label htmlFor="aceptaTerminos" className="cursor-pointer text-sm leading-relaxed text-noche">
              Leí y acepto los Términos y condiciones y la Política de privacidad de LocalCL (versión {terminos.version}).
            </label>
          </div>
          {errorCasilla && (
            <p id="aceptaTerminos-error" role="alert" className="mt-1.5 pl-8 text-sm font-medium text-error-700">
              {errorCasilla}
            </p>
          )}

          {errorGeneral && (
            <p role="alert" className="mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
              {errorGeneral}
            </p>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Boton
              type="button"
              variante="secundario"
              disabled={enviando || saliendo}
              onClick={() => {
                // Sin navegar antes: con la sesión todavía abierta, ExigirTerminos devolvería aquí.
                setSaliendo(true);
                void cerrarSesion();
              }}
            >
              {saliendo ? "Cerrando sesión…" : "No acepto, cerrar sesión"}
            </Boton>
            <Boton type="submit" cargando={enviando}>
              {enviando ? "Guardando…" : "Aceptar y continuar"}
            </Boton>
          </div>
        </form>
      )}
    </Pagina>
  );
}
