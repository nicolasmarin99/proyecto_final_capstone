import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi, type Usuario } from "../api/cliente";
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
 * Adónde llevar a alguien que acaba de entrar.
 *
 * Un prestador con el correo ya confirmado y sin perfil va directo a
 * completarlo: es el paso que le falta para que los clientes lo encuentren, y
 * es justo después de confirmar el correo cuando inicia sesión por primera
 * vez. Si el correo no está confirmado no se lo manda ahí, porque la API le
 * rechazaría el guardado; en /perfil ve el aviso de confirmación.
 *
 * Si la consulta del perfil falla, se va a /perfil igual: un error de red no
 * debe dejar a nadie en la pantalla de inicio de sesión.
 */
async function destinoTrasIngreso(usuario: Usuario, cliente: ClienteApi): Promise<string> {
  if (usuario.rol !== "PRESTADOR" || usuario.correoVerificado !== true) {
    return "/perfil";
  }

  try {
    return (await cliente.obtenerMiPerfilPrestador()) ? "/perfil" : "/perfil-prestador";
  } catch {
    return "/perfil";
  }
}

export default function PaginaIniciarSesion({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, iniciarSesion } = useAuth();

  const mensajeExito = leerMensajeDeExito(ubicacion.state);

  // La navegación la dispara el estado ya confirmado, no el final del envío.
  // Si se navegara justo después de await iniciarSesion(), RutaProtegida
  // podría renderizarse con el usuario todavía en null y rebotar de vuelta.
  useEffect(() => {
    if (!usuario) {
      return;
    }

    let cancelado = false;

    void destinoTrasIngreso(usuario, cliente).then((destino) => {
      if (!cancelado) navegar(destino, { replace: true });
    });

    return () => {
      cancelado = true;
    };
  }, [usuario, cliente, navegar]);

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
