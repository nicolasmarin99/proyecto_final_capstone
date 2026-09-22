import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { CampoTexto } from "../componentes/CampoTexto";
import { Pagina } from "../componentes/Pagina";

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
    <Pagina titulo="Iniciar sesión">
      {mensajeExito && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {mensajeExito}
        </p>
      )}

      <form onSubmit={alEnviar} noValidate className="mt-4">
        {errorGeneral && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
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

        <button
          type="submit"
          disabled={enviando}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
        ¿No tienes cuenta?{" "}
        <Link to="/registro" className="font-medium text-slate-900 underline">
          Crear cuenta
        </Link>
      </p>
    </Pagina>
  );
}
