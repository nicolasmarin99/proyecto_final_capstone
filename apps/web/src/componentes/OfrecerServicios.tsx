import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { esRutValido } from "@localcl/shared";
import { ErrorApi } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "./Boton";
import { CampoTexto } from "./CampoTexto";

/*
  Para un cliente que quiere ofrecer servicios con el MISMO correo: su cuenta
  pasa a ser de prestador. Una persona, una cuenta.

  Lo único que falta es el RUT (nombre, correo y contraseña ya los tiene).
  Antes de convertir se explica qué cambia y qué se conserva, y se pide
  confirmar: no hay forma de volver a ser cliente desde la web.
*/
export function OfrecerServicios({ correoVerificado }: { correoVerificado: boolean }) {
  const { convertirEnPrestador } = useAuth();
  const navegar = useNavigate();
  const idTitulo = useId();
  const idRut = useId();
  const [abierto, setAbierto] = useState(false);
  const [rut, setRut] = useState("");
  const [errorRut, setErrorRut] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function convertir(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!esRutValido(rut)) {
      setErrorRut("Revisa el RUT: el dígito verificador no coincide.");
      return;
    }
    setErrorRut(undefined);
    setEnviando(true);
    try {
      await convertirEnPrestador(rut);
      // Al área de prestador, a completar su perfil: es el primer paso para publicar.
      navegar("/mi/perfil", { replace: true });
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("rut")) setErrorRut(causa.mensajeDe("rut"));
      else setError(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-6 rounded-medio border border-borde p-4 sm:p-5">
      <h2 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        ¿Ofreces servicios?
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        No necesitas otra cuenta: esta misma, con tu correo, puede pasar a ser de prestador.
      </p>

      {!correoVerificado ? (
        <p className="mt-3 rounded-chico bg-niebla px-4 py-3 text-sm text-noche">Primero confirma tu correo con el enlace que te enviamos.</p>
      ) : !abierto ? (
        <Boton type="button" variante="secundario" className="mt-3" onClick={() => setAbierto(true)}>
          Quiero ofrecer mis servicios
        </Boton>
      ) : (
        <form onSubmit={convertir} noValidate className="mt-3">
          <ul className="space-y-1 rounded-chico bg-niebla px-4 py-3 text-sm text-noche">
            <li>• Conservas tu historial: contactos y valoraciones que hiciste.</li>
            <li>• Puedes seguir contratando y valorando a otros prestadores.</li>
            <li>• Para publicar, tendrás que verificar tu identidad con tu cédula.</li>
            <li>• Tu cuenta queda como cuenta de prestador: no se vuelve a cliente desde aquí.</li>
          </ul>
          <CampoTexto
            id={idRut}
            etiqueta="Tu RUT"
            valor={rut}
            alCambiar={(valor) => {
              setRut(valor);
              setErrorRut(undefined);
            }}
            autoComplete="off"
            error={errorRut}
            ayuda="Debe ser el de tu cédula: lo compararemos al verificar tu identidad."
          />
          {error && (
            <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
              {error}
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Boton type="button" variante="secundario" disabled={enviando} onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={enviando}>
              {enviando ? "Convirtiendo…" : "Convertir mi cuenta"}
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
