import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { Boton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { PaginaAuth } from "../componentes/PaginaAuth";

export default function PaginaRecuperarCuenta({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setEnviando(true);

    try {
      await cliente.solicitarRecuperacion(correo);
      // Se muestra lo mismo exista o no la cuenta: si la pantalla distinguiera,
      // el esfuerzo del servidor por no delatar cuentas no serviría de nada.
      setEnviado(true);
    } catch (error) {
      setErrorGeneral(
        error instanceof ErrorApi
          ? error.message
          : "No fue posible conectar con el servidor. Intenta de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <PaginaAuth sobretitulo="Recuperar cuenta" titulo="Revisa tu correo">
        <div
          role="status"
          className="mt-6 rounded-campo border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          Si el correo tiene una cuenta, te enviamos un enlace para recuperarla.
        </div>

        <p className="mt-4 text-sm text-piedra-500">
          El enlace sirve una sola vez y vence en 30 minutos.
        </p>

        <Link
          to="/iniciar-sesion"
          className="mt-7 flex min-h-12 items-center justify-center rounded-campo border border-piedra-300 px-4 text-sm font-semibold text-marca-900 transition hover:bg-piedra-50"
        >
          Volver a iniciar sesión
        </Link>
      </PaginaAuth>
    );
  }

  return (
    <PaginaAuth
      sobretitulo="Recuperar cuenta"
      titulo="¿Olvidaste tu contraseña?"
      intro="Escribe tu correo y te enviamos un enlace para elegir una nueva."
    >
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
        />

        <Boton type="submit" disabled={enviando} className="mt-7">
          {enviando ? "Enviando…" : "Enviarme el enlace"}
        </Boton>
      </form>

      <p className="mt-7 border-t border-piedra-100 pt-5 text-sm text-piedra-500">
        ¿Te acordaste?{" "}
        <Link
          to="/iniciar-sesion"
          className="font-semibold text-marca-900 underline decoration-acento-400 decoration-2 underline-offset-2 hover:text-acento-600"
        >
          Iniciar sesión
        </Link>
      </p>
    </PaginaAuth>
  );
}
