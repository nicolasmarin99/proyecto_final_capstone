import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi } from "../api/cliente";
import { CampoTexto } from "../componentes/CampoTexto";
import { Pagina } from "../componentes/Pagina";

export default function PaginaRegistro({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const [nombre, setNombre] = useState("");
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
      await cliente.registrar({ nombre, correo, contrasena });

      navegar("/iniciar-sesion", {
        replace: true,
        state: { mensaje: "Tu cuenta fue creada. Ya puedes iniciar sesión." },
      });
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
    <Pagina titulo="Crear cuenta">
      <form onSubmit={alEnviar} noValidate className="mt-4">
        {errorGeneral && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
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
        />

        <button
          type="submit"
          disabled={enviando}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {enviando ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link to="/iniciar-sesion" className="font-medium text-slate-900 underline">
          Iniciar sesión
        </Link>
      </p>
    </Pagina>
  );
}
