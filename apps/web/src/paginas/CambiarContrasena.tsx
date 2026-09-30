import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { mensajeDeProblema, revisarContrasena } from "@localcl/shared";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { confirmarReglas, confirmarRepeticion } from "../auth/confirmacionesContrasena";
import { revisarRepeticion } from "../auth/repeticionContrasena";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { Pagina } from "../componentes/Pagina";

export default function PaginaCambiarContrasena({
  cliente = clienteApi,
}: {
  cliente?: ClienteApi;
}) {
  const { usuario } = useAuth();

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repeticion, setRepeticion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    setErrorGeneral(null);

    const problema = revisarContrasena(nueva, {
      correo: usuario?.correo,
      nombre: usuario?.nombre,
    });

    if (problema) {
      setErrores({ contrasenaNueva: mensajeDeProblema(problema) });
      return;
    }

    // La repetición se compara después de las reglas: si la contraseña no
    // las cumple, igual hay que escribirla de nuevo.
    const errorRepeticion = revisarRepeticion(nueva, repeticion);

    if (errorRepeticion) {
      setErrores({ repeticion: errorRepeticion });
      return;
    }

    setEnviando(true);

    try {
      await cliente.cambiarContrasena(actual, nueva);
      setListo(true);
      setActual("");
      setNueva("");
      setRepeticion("");
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "CONTRASENA_ACTUAL_INCORRECTA") {
        // El servidor responde 400 y no 401 justamente para que el mensaje
        // caiga acá, bajo el campo, en vez de disparar un refresco de sesión.
        setErrores({ contrasenaActual: error.message });
      } else if (error instanceof ErrorApi && error.codigo === "DATOS_INVALIDOS") {
        setErrores(
          Object.fromEntries(
            error.detalles.map((detalle) => [
              detalle.campo === "contrasena" ? "contrasenaNueva" : detalle.campo,
              detalle.mensaje,
            ]),
          ),
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

  return (
    <Pagina titulo="Cambiar contraseña">
      {listo && (
        <p
          role="status"
          className="motion-safe:animate-aparecer-corto mt-6 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          Tu contraseña fue actualizada. Cerramos las demás sesiones y esta sigue abierta.
        </p>
      )}

      <form onSubmit={alEnviar} noValidate className="mt-2">
        {errorGeneral && (
          <p
            role="alert"
            className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {errorGeneral}
          </p>
        )}

        <CampoTexto
          id="contrasenaActual"
          etiqueta="Contraseña actual"
          tipo="password"
          autoComplete="current-password"
          valor={actual}
          alCambiar={setActual}
          error={errores.contrasenaActual}
        />
        <CampoTexto
          id="contrasenaNueva"
          etiqueta="Contraseña nueva"
          tipo="password"
          autoComplete="new-password"
          valor={nueva}
          alCambiar={setNueva}
          error={errores.contrasenaNueva}
          valido={confirmarReglas(nueva, { correo: usuario?.correo, nombre: usuario?.nombre })}
          ayuda="Mínimo 10 caracteres. No puede contener tu nombre ni tu correo."
        />

        <CampoTexto
          id="repeticion"
          etiqueta="Repetir contraseña nueva"
          tipo="password"
          autoComplete="new-password"
          valor={repeticion}
          alCambiar={setRepeticion}
          error={errores.repeticion}
          valido={confirmarRepeticion(nueva, repeticion)}
        />

        <Boton type="submit" cargando={enviando} className="mt-7">
          {enviando ? "Guardando…" : "Cambiar contraseña"}
        </Boton>
      </form>

      <p className="mt-6 border-t border-borde pt-5 text-center text-sm text-texto-suave">
        <Link
          to="/perfil"
          className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
        >
          Volver a mi perfil
        </Link>
      </p>
    </Pagina>
  );
}
