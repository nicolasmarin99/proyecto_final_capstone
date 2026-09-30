import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  esRutValido,
  mensajeDeProblema,
  normalizarRut,
  revisarContrasena,
} from "@localcl/shared";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { Boton } from "../componentes/Boton";
import { CampoTexto } from "../componentes/CampoTexto";
import { PaginaAuth } from "../componentes/PaginaAuth";

export default function PaginaRegistroPrestador({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [rut, setRut] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Se usa el mismo paquete que valida la API, así que la regla es una sola.
  const rutNormalizado = normalizarRut(rut);
  const rutReconocido = esRutValido(rut);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    setErrorGeneral(null);

    // Comprobar aquí es comodidad: ahorra un viaje al servidor y avisa antes
    // de enviar. No es la protección. Cualquiera puede saltarse este código
    // desde la consola del navegador o llamar al endpoint con curl, y por eso
    // la API vuelve a validar el RUT con esta misma función antes de guardar.
    if (!rutReconocido) {
      setErrores({ rut: "El RUT no es válido." });
      return;
    }

    // Mismas reglas que aplica la API, desde el paquete compartido.
    const problema = revisarContrasena(contrasena, { correo, nombre });

    if (problema) {
      setErrores({ contrasena: mensajeDeProblema(problema) });
      return;
    }

    setEnviando(true);

    try {
      await cliente.registrarPrestador({ nombre, correo, contrasena, rut: rutNormalizado });

      navegar("/revisa-tu-correo", { replace: true, state: { correo } });
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

  return (
    <PaginaAuth
      sobretitulo="Crear cuenta de prestador"
      titulo="Ofrece tus servicios"
      intro="Necesitamos tu RUT para poder acreditar tus credenciales más adelante."
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
          id="rut"
          etiqueta="RUT"
          autoComplete="off"
          valor={rut}
          alCambiar={setRut}
          error={errores.rut}
        />

        {rutReconocido && (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-exito-700">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Se guardará como {rutNormalizado}
          </p>
        )}

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

        <Boton type="submit" disabled={enviando} className="mt-7">
          {enviando ? "Creando cuenta…" : "Crear cuenta de prestador"}
        </Boton>
      </form>

      <div className="mt-7 border-t border-borde pt-5 text-sm text-texto-suave">
        <p>
          ¿Buscas servicios en vez de ofrecerlos?{" "}
          <Link
            to="/registro"
            className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
          >
            Crear cuenta de cliente
          </Link>
        </p>
      </div>
    </PaginaAuth>
  );
}
