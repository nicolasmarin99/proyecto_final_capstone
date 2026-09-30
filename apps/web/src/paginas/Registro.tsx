import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { mensajeDeProblema, revisarContrasena } from "@localcl/shared";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { revisarRepeticion } from "../auth/repeticionContrasena";
import { Boton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { PaginaAuth } from "../componentes/PaginaAuth";

export default function PaginaRegistro({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repeticion, setRepeticion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    setErrorGeneral(null);

    // Misma función que usa la API, así que la regla es una sola. Comprobar
    // acá es comodidad: avisa antes de enviar y ahorra un viaje. La que manda
    // es la del servidor, que además consulta si la contraseña está filtrada.
    const problema = revisarContrasena(contrasena, { correo, nombre });

    if (problema) {
      setErrores({ contrasena: mensajeDeProblema(problema) });
      return;
    }

    // Solo se compara después de que la contraseña cumple las reglas: si no
    // las cumple, la persona igual tiene que escribirla de nuevo.
    const errorRepeticion = revisarRepeticion(contrasena, repeticion);

    if (errorRepeticion) {
      setErrores({ repeticion: errorRepeticion });
      return;
    }

    setEnviando(true);

    try {
      await cliente.registrar({ nombre, correo, contrasena });

      // El correo viaja en el state para poder ofrecer el reenvío del enlace
      // sin volver a pedírselo a la persona.
      navegar("/revisa-tu-correo", { replace: true, state: { correo } });
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "DATOS_INVALIDOS") {
        // La API indica el campo exacto en detalles; se muestra junto a él.
        setErrores(
          Object.fromEntries(error.detalles.map((detalle) => [detalle.campo, detalle.mensaje])),
        );
      } else if (error instanceof ErrorApi) {
        // Incluye el 409 de correo ya registrado: el mensaje de la API es
        // deliberadamente genérico para no confirmar qué correos existen.
        setErrorGeneral(error.message);
      } else {
        setErrorGeneral("No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaAuth
      sobretitulo="Crear cuenta"
      titulo="Busca y contrata"
      intro="Encuentra prestadores con sus credenciales acreditadas en la Región Metropolitana."
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
          id="nombre"
          etiqueta="Nombre"
          autoComplete="name"
          valor={nombre}
          alCambiar={setNombre}
          error={errores.nombre}
        />
        <CampoTexto
          id="correo"
          etiqueta="Correo"
          tipo="email"
          autoComplete="email"
          valor={correo}
          alCambiar={setCorreo}
          error={errores.correo}
        />
        <CampoTexto
          id="contrasena"
          etiqueta="Contraseña"
          tipo="password"
          autoComplete="new-password"
          valor={contrasena}
          alCambiar={setContrasena}
          error={errores.contrasena}
          ayuda="Mínimo 10 caracteres."
        />

        <CampoTexto
          id="repeticion"
          etiqueta="Repetir contraseña"
          tipo="password"
          autoComplete="new-password"
          valor={repeticion}
          alCambiar={setRepeticion}
          error={errores.repeticion}
        />

        <Boton type="submit" disabled={enviando} className="mt-7">
          {enviando ? "Creando cuenta…" : "Crear cuenta"}
        </Boton>
      </form>

      <div className="mt-7 space-y-2 border-t border-borde pt-5 text-sm text-texto-suave">
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/iniciar-sesion"
            className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
          >
            Iniciar sesión
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
