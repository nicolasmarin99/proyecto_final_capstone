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

export default function PaginaIniciarSesion() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, iniciarSesion } = useAuth();

  const mensajeExito = leerMensajeDeExito(ubicacion.state);

  // La navegación la dispara el estado ya confirmado, no el final del envío.
  // Si se navegara justo después de await iniciarSesion(), RutaProtegida
  // podría renderizarse con el usuario todavía en null y rebotar de vuelta.
  useEffect(() => {
    if (usuario) {
      navegar("/perfil", { replace: true });
    }
  }, [usuario, navegar]);

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
          className="mt-6 rounded-campo border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          {mensajeExito}
        </p>
      )}

      <form onSubmit={alEnviar} noValidate className="mt-6">
        {errorGeneral && (
          <p
            role="alert"
            className="rounded-campo border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
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
            className="font-medium text-piedra-500 underline underline-offset-2 hover:text-acento-600"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <Boton type="submit" disabled={enviando} className="mt-5">
          {enviando ? "Entrando…" : "Entrar"}
        </Boton>
      </form>

      <div className="mt-7 space-y-2 border-t border-piedra-100 pt-5 text-sm text-piedra-500">
        <p>
          ¿No tienes cuenta?{" "}
          <Link
            to="/registro"
            className="font-semibold text-marca-900 underline decoration-acento-400 decoration-2 underline-offset-2 hover:text-acento-600"
          >
            Crear cuenta
          </Link>
        </p>
        <p>
          ¿Ofreces servicios?{" "}
          <Link
            to="/registro-prestador"
            className="font-semibold text-marca-900 underline decoration-acento-400 decoration-2 underline-offset-2 hover:text-acento-600"
          >
            Registrarme como prestador
          </Link>
        </p>
      </div>
    </PaginaAuth>
  );
}
