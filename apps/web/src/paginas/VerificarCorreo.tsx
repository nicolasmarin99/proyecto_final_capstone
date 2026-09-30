import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { clasesBoton } from "../componentes/Boton";
import { clienteApi, type ClienteApi } from "../api/cliente";
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
            className="rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
          >
            Tu correo quedó confirmado. Ya puedes publicar servicios y dejar valoraciones.
          </div>
        )}

        {estado === "invalido" && (
          <div
            role="alert"
            className="rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm text-error-700"
          >
            Este enlace no es válido o ya expiró. Pide uno nuevo desde tu perfil o al iniciar
            sesión.
          </div>
        )}
      </div>

      {estado !== "verificando" && (
        <Link
          to="/iniciar-sesion"
          className={`mt-7 ${clasesBoton("principal")}`}
        >
          Ir a iniciar sesión
        </Link>
      )}
    </PaginaAuth>
  );
}
