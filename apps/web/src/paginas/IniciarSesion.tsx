import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { PaginaAuth } from "../componentes/PaginaAuth";

/** El aviso de registro exitoso llega en el state de la navegación. */
function leerMensajeDeExito(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "mensaje" in state) {
    const mensaje: unknown = (state as Record<string, unknown>).mensaje;
    return typeof mensaje === "string" ? mensaje : null;
  }

  return null;
}

/**
 * Destino guardado por quien mandó a iniciar sesión (una ruta protegida, o
 * la página de un servicio que se quería contactar), en state.desde.
 *
 * Solo se aceptan rutas internas: empiezan con "/" pero no con "//", que el
 * navegador interpretaría como otro dominio. Así nadie puede armar un enlace
 * a /iniciar-sesion que después de entrar lleve a un sitio falso.
 */
function leerDestino(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("desde" in state)) {
    return null;
  }

  const desde: unknown = (state as Record<string, unknown>).desde;

  return typeof desde === "string" && desde.startsWith("/") && !desde.startsWith("//") && !desde.startsWith("/iniciar-sesion")
    ? desde
    : null;
}

export default function PaginaIniciarSesion() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, iniciarSesion } = useAuth();

  const mensajeExito = leerMensajeDeExito(ubicacion.state);
  const destino = leerDestino(ubicacion.state);

  // La navegación la dispara el estado ya confirmado, no el final del envío.
  // Si se navegara justo después de await iniciarSesion(), RutaProtegida
  // podría renderizarse con el usuario todavía en null y rebotar de vuelta.
  //
  // Sin destino guardado se va a la landing: el encabezado ya muestra la
  // sesión y, al prestador, lo que le falta (por ejemplo, completar el perfil).
  useEffect(() => {
    if (usuario) {
      navegar(destino ?? "/", { replace: true });
    }
  }, [usuario, destino, navegar]);

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    setErrorGeneral(null);
    setEnviando(true);

    try {
      await iniciarSesion(correo, contrasena);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "DATOS_INVALIDOS") {
        setErrores(
          Object.fromEntries(error.detalles.map((detalle) => [detalle.campo, detalle.mensaje])),
        );
      } else if (error instanceof ErrorApi && error.estado === 401) {
        // Mensaje genérico a propósito: no se dice si falló el correo o la
        // contraseña, porque eso permitiría averiguar qué cuentas existen.
        setErrorGeneral("Correo o contraseña incorrectos.");
      } else if (error instanceof ErrorApi) {
        setErrorGeneral(error.message);
      } else {
        setErrorGeneral("No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaAuth sobretitulo="Bienvenido de vuelta" titulo="Iniciar sesión">
      {mensajeExito && (
        <p
          role="status"
          className="motion-safe:animate-aparecer-corto mt-6 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          {mensajeExito}
        </p>
      )}

      <form onSubmit={alEnviar} noValidate className="mt-6">
        {errorGeneral && (
          <p
            role="alert"
            className="motion-safe:animate-aparecer-corto rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {errorGeneral}
          </p>
        )}

        <CampoTexto
          id="correo"
          etiqueta="Correo"
          tipo="email"
          autoComplete="username"
          valor={correo}
          alCambiar={setCorreo}
          error={errores.correo}
        />
        <CampoTexto
          id="contrasena"
          etiqueta="Contraseña"
          tipo="password"
          autoComplete="current-password"
          valor={contrasena}
          alCambiar={setContrasena}
          error={errores.contrasena}
        />

        <p className="mt-3 text-right text-sm">
          <Link
            to="/recuperar-cuenta"
            className="font-medium text-texto-suave underline underline-offset-2 hover:text-primario"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <Boton type="submit" cargando={enviando} className="mt-5">
          {enviando ? "Entrando…" : "Entrar"}
        </Boton>
      </form>

      <div className="mt-7 space-y-2 border-t border-borde pt-5 text-sm text-texto-suave">
        <p>
          ¿No tienes cuenta?{" "}
          <Link
            to="/registro"
            className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
          >
            Crear cuenta
          </Link>
        </p>
        <p>
          ¿Ofreces servicios?{" "}
          <Link
            to="/registro-prestador"
            className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
          >
            Registrarme como prestador
          </Link>
        </p>
      </div>
    </PaginaAuth>
  );
}
