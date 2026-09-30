import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { mensajeDeProblema, revisarContrasena } from "@localcl/shared";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { Boton, clasesBoton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { PaginaAuth } from "../componentes/PaginaAuth";

/** Destino del enlace de recuperación: /restablecer-contrasena?token=... */
export default function PaginaRestablecerContrasena({
  cliente = clienteApi,
}: {
  cliente?: ClienteApi;
}) {
  const [parametros] = useSearchParams();
  const token = parametros.get("token");

  const [contrasena, setContrasena] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    setErrorGeneral(null);

    if (!token) {
      setErrorGeneral("Este enlace no es válido o ya expiró.");
      return;
    }

    // Se revisa el largo antes de gastar el enlace. No se puede comprobar que
    // no contenga el correo ni el nombre, porque esta pantalla no los conoce:
    // eso lo hace el servidor, que sí sabe de quién es el token.
    const problema = revisarContrasena(contrasena);

    if (problema) {
      setErrores({ contrasena: mensajeDeProblema(problema) });
      return;
    }

    setEnviando(true);

    try {
      await cliente.restablecerContrasena(token, contrasena);
      setListo(true);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "DATOS_INVALIDOS") {
        setErrores(
          Object.fromEntries(error.detalles.map((detalle) => [detalle.campo, detalle.mensaje])),
        );
      } else if (error instanceof ErrorApi) {
        setErrorGeneral(error.message);
      } else {
        setErrorGeneral("No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <PaginaAuth sobretitulo="Recuperar cuenta" titulo="Contraseña actualizada">
        <div
          role="status"
          className="mt-6 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          Tu contraseña fue actualizada. Cerramos todas las sesiones abiertas, así que tendrás que
          entrar de nuevo.
        </div>

        <Link
          to="/iniciar-sesion"
          className={`mt-7 ${clasesBoton("principal")}`}
        >
          Iniciar sesión
        </Link>
      </PaginaAuth>
    );
  }

  return (
    <PaginaAuth
      sobretitulo="Recuperar cuenta"
      titulo="Elige una contraseña nueva"
      intro="Al guardarla cerramos todas las sesiones abiertas de tu cuenta."
    >
      <form onSubmit={alEnviar} noValidate className="mt-6">
        {errorGeneral && (
          <p
            role="alert"
            className="rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {errorGeneral}
          </p>
        )}

        <CampoTexto
          id="contrasena"
          etiqueta="Contraseña nueva"
          tipo="password"
          autoComplete="new-password"
          valor={contrasena}
          alCambiar={setContrasena}
          error={errores.contrasena}
          ayuda="Mínimo 10 caracteres. No puede contener tu nombre ni tu correo."
        />

        <Boton type="submit" disabled={enviando} className="mt-7">
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </Boton>
      </form>

      <p className="mt-7 border-t border-borde pt-5 text-sm text-texto-suave">
        ¿El enlace ya no sirve?{" "}
        <Link
          to="/recuperar-cuenta"
          className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
        >
          Pedir uno nuevo
        </Link>
      </p>
    </PaginaAuth>
  );
}
