import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { clienteApi, type ClienteApi, type Usuario } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton, clasesBoton } from "../componentes/Boton";
import { Pagina } from "../componentes/Pagina";

export default function PaginaPerfil({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const navegar = useNavigate();
  const { cerrarSesion } = useAuth();
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let cancelado = false;

    // Se pide a la API en vez de usar lo que ya tiene el contexto: es el dato
    // vigente, y de paso comprueba que la sesión siga siendo válida.
    cliente
      .obtenerPerfil()
      .then((usuario) => {
        if (!cancelado) setPerfil(usuario);
      })
      .catch(() => {
        if (!cancelado) setError("No fue posible cargar tu perfil.");
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  async function alCerrarSesion() {
    setSaliendo(true);
    // Se navega antes de limpiar la sesión. Al revés, RutaProtegida vería el
    // usuario en null mientras esta página sigue montada y redirigiría a
    // iniciar sesión en vez de volver al inicio.
    navegar("/", { replace: true });
    await cerrarSesion();
  }

  return (
    <Pagina titulo="Mi perfil">
      <div className="mt-6">
        {error && (
          <p
            role="alert"
            className="motion-safe:animate-aparecer-corto rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
          >
            {error}
          </p>
        )}

        {!error && !perfil && <p className="text-sm text-texto-suave">Cargando tu perfil…</p>}

        {/*
          Solo cuando la API dice explícitamente que NO está verificado. Si el
          dato no viniera, callar es mejor que acusar a quien sí lo confirmó.
        */}
        {perfil?.correoVerificado === false && (
          <div className="mb-4 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
            <p className="font-semibold">Tu correo no está confirmado</p>
            <p className="mt-1">
              Hasta que lo confirmes no puedes publicar servicios ni dejar valoraciones. Busca el
              enlace que te enviamos al registrarte.
            </p>
          </div>
        )}

        {perfil && (
          <dl className="rounded-chico border border-borde bg-niebla p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-texto-suave">Nombre</dt>
              <dd className="font-medium text-noche">{perfil.nombre}</dd>
            </div>
            <div className="mt-2.5 flex justify-between gap-4">
              <dt className="text-texto-suave">Correo</dt>
              <dd className="font-medium text-noche">{perfil.correo}</dd>
            </div>
            <div className="mt-2.5 flex justify-between gap-4">
              <dt className="text-texto-suave">Rol</dt>
              <dd className="font-medium text-noche">{perfil.rol}</dd>
            </div>
          </dl>
        )}
      </div>

      {/*
        Ocultar este enlace es comodidad, no seguridad: solo evita ofrecerle a
        un cliente una pantalla que no le sirve. Cualquiera puede escribir
        /admin en la barra de direcciones o llamar al endpoint con curl, y por
        eso la protección de verdad vive en el servidor, donde autorizar()
        comprueba el rol contra la base en cada petición.
      */}
      <Link
        to="/cambiar-contrasena"
        className={`mt-6 ${clasesBoton("secundario")}`}
      >
        Cambiar contraseña
      </Link>

      {perfil?.rol === "ADMINISTRADOR" && (
        <Link
          to="/admin"
          className={`mt-3 ${clasesBoton("secundario")}`}
        >
          Panel de administración
        </Link>
      )}

      <Boton type="button" onClick={alCerrarSesion} cargando={saliendo} className="mt-4">
        {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
      </Boton>
    </Pagina>
  );
}
