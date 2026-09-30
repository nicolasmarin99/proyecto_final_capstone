import { useState } from "react";
import { Link, useLocation } from "react-router";
import { clienteApi, type ClienteApi } from "../api/cliente";
import { Boton } from "../componentes/Boton";
import { PaginaAuth } from "../componentes/PaginaAuth";

/** El correo llega en el state de la navegación desde el formulario de registro. */
function leerCorreo(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "correo" in state) {
    const correo: unknown = (state as Record<string, unknown>).correo;
    return typeof correo === "string" && correo.length > 0 ? correo : null;
  }

  return null;
}

/**
 * Pantalla posterior al registro.
 *
 * El texto no afirma que la cuenta se haya creado: la API responde igual
 * exista o no el correo, y la pantalla no puede saber más que ella. Decir
 * "tu cuenta fue creada" sería inventar una certeza que no tenemos, y de paso
 * delataría lo que el 202 se esfuerza en ocultar.
 */
export default function PaginaRevisaTuCorreo({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const ubicacion = useLocation();
  const correo = leerCorreo(ubicacion.state);

  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function reenviar() {
    if (!correo) {
      return;
    }

    setReenviando(true);

    try {
      await cliente.reenviarVerificacion(correo);
    } finally {
      // Mismo aviso pase lo que pase: el servidor tampoco distingue, y además
      // hay una espera mínima entre reenvíos que no tiene sentido explicar acá.
      setAviso("Si hay un enlace pendiente, te lo enviamos de nuevo.");
      setReenviando(false);
    }
  }

  return (
    <PaginaAuth
      sobretitulo="Casi listo"
      titulo="Revisa tu correo"
      intro={
        correo
          ? `Si ${correo} no estaba registrado, te enviamos un enlace para confirmarlo.`
          : "Si el correo no estaba registrado, te enviamos un enlace para confirmarlo."
      }
    >
      <div className="mt-6 rounded-chico border border-borde bg-niebla px-4 py-3 text-sm text-texto-suave">
        El enlace sirve una sola vez y vence en 24 horas. Si no lo ves, revisa la carpeta de
        correo no deseado.
      </div>

      {aviso && (
        <p
          role="status"
          className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700"
        >
          {aviso}
        </p>
      )}

      {correo && (
        <Boton
          type="button"
          variante="secundario"
          onClick={reenviar}
          cargando={reenviando}
          className="mt-6"
        >
          {reenviando ? "Enviando…" : "Reenviar el enlace"}
        </Boton>
      )}

      <p className="mt-7 border-t border-borde pt-5 text-sm text-texto-suave">
        ¿Ya lo confirmaste?{" "}
        <Link
          to="/iniciar-sesion"
          className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
        >
          Iniciar sesión
        </Link>
      </p>
    </PaginaAuth>
  );
}
