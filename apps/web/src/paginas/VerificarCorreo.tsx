import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { clasesBoton } from "../componentes/Boton";
import { clienteApi, type ClienteApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { PaginaAuth } from "../componentes/PaginaAuth";

type Estado = "verificando" | "listo" | "invalido";

/**
 * Destino del enlace que llega por correo: /verificar-correo?token=...
 *
 * El token viaja en la URL porque un enlace de correo no puede mandar un
 * cuerpo. La página lo toma de ahí y lo envía a la API en el cuerpo de un
 * POST, para que no quede en los registros del servidor.
 */
export default function PaginaVerificarCorreo({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const [parametros] = useSearchParams();
  const { usuario } = useAuth();
  // Normalmente el enlace se abre sin sesión. Si quien lo abre ya entró como
  // prestador, se lo lleva directo al paso que sigue: completar su perfil.
  const prestadorConectado = usuario?.rol === "PRESTADOR";
  const [estado, setEstado] = useState<Estado>("verificando");

  const token = parametros.get("token");

  useEffect(() => {
    let cancelado = false;

    if (!token) {
      setEstado("invalido");
      return;
    }

    cliente
      .verificarCorreo(token)
      .then(() => {
        if (!cancelado) setEstado("listo");
      })
      .catch(() => {
        // La API responde lo mismo para un enlace vencido, uno ya usado y uno
        // inventado, así que la página tampoco distingue.
        if (!cancelado) setEstado("invalido");
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, token]);

  return (
    <PaginaAuth
      sobretitulo="Confirmación de correo"
      titulo={estado === "listo" ? "Correo confirmado" : "Confirmar tu correo"}
    >
      <div className="mt-6">
        {estado === "verificando" && (
          <p className="text-[15px] text-texto-suave">Estamos confirmando tu correo…</p>
        )}

        {estado === "listo" && (
          <div
            role="status"
            className="motion-safe:animate-aparecer-corto rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
          >
            Tu correo quedó confirmado. Ya puedes publicar servicios y dejar valoraciones.
            {!usuario && (
              <span className="mt-1 block">
                Si eres prestador, al entrar te pediremos completar tu perfil: es lo que permite que
                los clientes de tu zona te encuentren.
              </span>
            )}
          </div>
        )}

        {estado === "invalido" && (
          <div
            role="alert"
            className="motion-safe:animate-aparecer-corto rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm text-error-700"
          >
            Este enlace no es válido o ya expiró. Pide uno nuevo desde tu perfil o al iniciar
            sesión.
          </div>
        )}
      </div>

      {estado === "listo" && prestadorConectado && (
        <Link to="/perfil-prestador" className={`mt-7 ${clasesBoton("principal")}`}>
          Completar mi perfil de prestador
        </Link>
      )}

      {estado !== "verificando" && !(estado === "listo" && prestadorConectado) && (
        <Link
          to={usuario ? "/perfil" : "/iniciar-sesion"}
          className={`mt-7 ${clasesBoton("principal")}`}
        >
          {usuario ? "Ir a mi perfil" : "Ir a iniciar sesión"}
        </Link>
      )}
    </PaginaAuth>
  );
}
