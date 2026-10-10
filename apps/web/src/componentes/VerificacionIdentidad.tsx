import { useEffect, useId, useState, type FormEvent } from "react";
import { TAMANO_MAXIMO_DOCUMENTO, TIPOS_DOCUMENTO_PERMITIDOS } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type MiIdentidad } from "../api/cliente";
import { Boton } from "./Boton";
import { Icono } from "./iconos";
import { MensajeCampo, mensajeVisible } from "./MensajeCampo";

const MEGAS = TAMANO_MAXIMO_DOCUMENTO / (1024 * 1024);
const TIPOS_PERMITIDOS: readonly string[] = TIPOS_DOCUMENTO_PERMITIDOS;

/**
 * Revisión en el navegador, para avisar sin gastar una de las 3 cargas
 * diarias. La API vuelve a revisar todo, y el tipo lo decide por el
 * contenido del archivo, no por lo que dice el navegador.
 */
function revisarArchivo(archivo: File | null): string | null {
  if (!archivo) return "Elige el archivo de tu documento.";
  if (archivo.size > TAMANO_MAXIMO_DOCUMENTO) return `El archivo supera los ${MEGAS} MB.`;
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) return "El archivo debe ser JPG, PNG o PDF.";
  return null;
}

/**
 * Carga del documento de identidad, dentro del perfil del prestador.
 *
 * Explica antes de pedir: para qué se usa, quién lo ve y cuándo se borra.
 * Pedir una cédula sin decir eso es lo que hace que la gente desconfíe, con
 * razón.
 */
export function VerificacionIdentidad({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const idCampo = useId();
  const [datos, setDatos] = useState<MiIdentidad | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    cliente
      .obtenerMiIdentidad()
      .then((respuesta) => {
        if (!cancelado) setDatos(respuesta);
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = revisarArchivo(archivo);
    setError(problema ?? undefined);

    if (problema || !archivo) return;

    setEnviando(true);

    try {
      const identidad = await cliente.subirDocumentoIdentidad(archivo);
      setDatos((actual) => ({
        identidad,
        cargasDisponibles: Math.max(0, (actual?.cargasDisponibles ?? 1) - 1),
      }));
      setArchivo(null);
    } catch (causa) {
      setError(
        causa instanceof ErrorApi
          ? (causa.mensajeDe("documento") ?? causa.message)
          : "No fue posible conectar con el servidor. Intenta de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const estado = datos?.identidad?.estado ?? null;
  // Se puede (volver a) subir si nunca subió nada o si la última no prosperó.
  const puedeSubir = datos !== null && estado !== "PENDIENTE" && estado !== "VERIFICADA";
  const idMensaje = `${idCampo}-mensaje`;

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Verifica tu identidad
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-texto-suave">
        Un administrador compara el nombre y el RUT de tu cuenta con tu cédula de identidad. Así los
        clientes saben que eres quien dices ser.
      </p>

      <ul className="mt-3 space-y-1.5 text-sm text-texto-suave">
        <li className="flex gap-2">
          <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
          Solo un administrador lo ve, con un enlace que vence a los 5 minutos.
        </li>
        <li className="flex gap-2">
          <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
          Se elimina apenas termina la revisión, se apruebe o se rechace.
        </li>
        <li className="flex gap-2">
          <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
          Antes de guardarla quitamos los datos ocultos de la foto, como la ubicación o el modelo del
          teléfono.
        </li>
      </ul>

      {errorCarga && (
        <p className="mt-4 text-sm text-texto-suave">No fue posible consultar el estado de tu verificación.</p>
      )}

      {estado === "PENDIENTE" && (
        <p
          role="status"
          className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-borde bg-hielo/60 px-4 py-3 text-sm text-noche"
        >
          <span className="font-semibold">En revisión.</span> Un administrador revisará tu documento y te
          avisaremos el resultado aquí.
        </p>
      )}

      {estado === "VERIFICADA" && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm font-medium text-exito-700"
        >
          <Icono nombre="visto" tamano={18} grosor={2.2} />
          Identidad verificada. Tu documento ya fue eliminado.
        </p>
      )}

      {estado === "RECHAZADA" && (
        <div className="mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm text-error-700">
          <p className="font-semibold">Tu documento fue rechazado y ya fue eliminado. El motivo:</p>
          <p className="mt-1">{datos?.identidad?.motivoRechazo}</p>
        </div>
      )}

      {puedeSubir && (
        <form onSubmit={alEnviar} noValidate className="mt-4">
          <label htmlFor={idCampo} className="block text-sm font-bold text-noche">
            Documento de identidad (JPG, PNG o PDF, hasta {MEGAS} MB)
          </label>
          <input
            id={idCampo}
            name="documento"
            type="file"
            accept={TIPOS_DOCUMENTO_PERMITIDOS.join(",")}
            onChange={(evento) => {
              setArchivo(evento.target.files?.[0] ?? null);
              setError(undefined);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={mensajeVisible({ error }) ? idMensaje : undefined}
            className="mt-1.5 block w-full cursor-pointer rounded-chico border border-borde-fuerte bg-niebla text-sm text-noche file:mr-4 file:cursor-pointer file:rounded-l-chico file:border-0 file:bg-hielo file:px-4 file:py-3 file:font-semibold file:text-primario hover:file:bg-borde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
          />
          <MensajeCampo
            id={idMensaje}
            mensajes={{
              error,
              ayuda:
                datos && datos.cargasDisponibles < 3
                  ? `Te quedan ${datos.cargasDisponibles} ${datos.cargasDisponibles === 1 ? "intento" : "intentos"} en las próximas 24 horas.`
                  : "Puedes tomarle una foto con el celular. Que se lean bien tu nombre y tu RUT.",
            }}
          />

          <Boton type="submit" variante="secundario" cargando={enviando} className="mt-4">
            {enviando ? "Enviando…" : "Enviar documento"}
          </Boton>
        </form>
      )}
    </section>
  );
}
