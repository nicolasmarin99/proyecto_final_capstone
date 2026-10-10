import { useCallback, useEffect, useId, useState } from "react";
import { formatearRut } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type IdentidadEnCola } from "../api/cliente";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";

const POR_PAGINA = 10;
const MINIMO_MOTIVO = 10;

function mensajeDeError(causa: unknown, porDefecto: string): string {
  return causa instanceof ErrorApi ? causa.message : porDefecto;
}

const formatoHora = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });
const formatoFecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

/**
 * Una solicitud de la cola: datos de la cuenta, documento a pedido y decisión.
 *
 * El documento no se pide al cargar la cola: cada vista queda registrada en
 * la bitácora de accesos, así que solo se pide cuando el administrador lo
 * abre de verdad. La URL vive en el estado del componente y se descarta al
 * decidir: no se guarda en ningún otro lado.
 */
function SolicitudIdentidad({
  solicitud,
  cliente,
  alResolver,
}: {
  solicitud: IdentidadEnCola;
  cliente: ClienteApi;
  alResolver(id: string, mensaje: string): void;
}) {
  const idNombre = useId();
  const [documento, setDocumento] = useState<{ url: string; expiraEn: string } | null>(null);
  const [imagenFallo, setImagenFallo] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"documento" | "aprobar" | "rechazar" | null>(null);

  const { nombre, rut, comuna } = solicitud.prestador;

  async function verDocumento() {
    setError(null);
    setImagenFallo(false);
    setOcupado("documento");
    try {
      setDocumento(await cliente.obtenerDocumentoIdentidad(solicitud.id));
    } catch (causa) {
      setError(mensajeDeError(causa, "No fue posible obtener el documento."));
    } finally {
      setOcupado(null);
    }
  }

  async function aprobar() {
    setError(null);
    setOcupado("aprobar");
    try {
      await cliente.aprobarIdentidad(solicitud.id);
      alResolver(solicitud.id, `Identidad de ${nombre} aprobada. El documento fue eliminado.`);
    } catch (causa) {
      setError(mensajeDeError(causa, "No fue posible aprobar la identidad."));
      setOcupado(null);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < MINIMO_MOTIVO) {
      setErrorMotivo(`Indica el motivo del rechazo (al menos ${MINIMO_MOTIVO} caracteres): el prestador lo leerá.`);
      return;
    }
    setErrorMotivo(undefined);
    setError(null);
    setOcupado("rechazar");
    try {
      await cliente.rechazarIdentidad(solicitud.id, motivo.trim());
      alResolver(solicitud.id, `Identidad de ${nombre} rechazada. El documento fue eliminado.`);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("motivo")) {
        setErrorMotivo(causa.mensajeDe("motivo"));
      } else {
        setError(mensajeDeError(causa, "No fue posible rechazar la identidad."));
      }
      setOcupado(null);
    }
  }

  return (
    <article aria-labelledby={idNombre} className="rounded-medio border border-borde p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={idNombre} className="font-titulos text-base font-bold text-noche">
          {nombre}
        </h3>
        <p className="text-sm text-texto-suave">Enviada el {formatoFecha.format(new Date(solicitud.enviadaEn))}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-texto-suave">RUT de la cuenta</dt>
        <dd className="font-medium text-noche">{rut ? formatearRut(rut) : "No informado"}</dd>
        <dt className="text-texto-suave">Comuna</dt>
        <dd className="text-noche">{comuna}</dd>
      </dl>

      {documento ? (
        <figure className="mt-4">
          {imagenFallo ? (
            <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">
              No se pudo mostrar el documento como imagen. Con el almacenamiento en memoria de desarrollo
              los PDF no se convierten; en producción Cloudinary entrega siempre una imagen.
            </p>
          ) : (
            <img
              src={documento.url}
              alt={`Documento de identidad de ${nombre}`}
              // No enviar la página de origen a Cloudinary, y no dejar que el
              // navegador ofrezca guardar ni arrastrar la imagen con facilidad.
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImagenFallo(true)}
              className="max-h-[480px] w-full rounded-chico border border-borde bg-niebla object-contain"
            />
          )}
          <figcaption className="mt-1.5 text-xs text-texto-suave">
            El enlace vence a las {formatoHora.format(new Date(documento.expiraEn))}. Esta vista quedó registrada.
          </figcaption>
        </figure>
      ) : (
        <Boton
          type="button"
          variante="secundario"
          cargando={ocupado === "documento"}
          disabled={ocupado !== null}
          onClick={verDocumento}
          className="mt-4"
        >
          {ocupado === "documento" ? "Generando enlace…" : "Ver documento"}
        </Boton>
      )}

      {error && (
        <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {rechazando ? (
        <div className="mt-2">
          <CampoAreaTexto
            id={`motivo-${solicitud.id}`}
            etiqueta="Motivo del rechazo"
            valor={motivo}
            alCambiar={(valor) => {
              setMotivo(valor);
              setErrorMotivo(undefined);
            }}
            minimo={MINIMO_MOTIVO}
            maximo={500}
            error={errorMotivo}
            ayuda="El prestador verá este texto. Dile qué corregir, por ejemplo: «la foto está borrosa»."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Boton type="button" variante="secundario" disabled={ocupado !== null} onClick={() => setRechazando(false)}>
              Cancelar
            </Boton>
            <Boton type="button" cargando={ocupado === "rechazar"} disabled={ocupado !== null} onClick={rechazar}>
              {ocupado === "rechazar" ? "Rechazando…" : "Confirmar rechazo"}
            </Boton>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Boton type="button" variante="secundario" disabled={ocupado !== null} onClick={() => setRechazando(true)}>
            Rechazar
          </Boton>
          <Boton type="button" cargando={ocupado === "aprobar"} disabled={ocupado !== null} onClick={aprobar}>
            {ocupado === "aprobar" ? "Aprobando…" : "Aprobar"}
          </Boton>
        </div>
      )}
    </article>
  );
}

/** Cola de identidades pendientes, de la más antigua a la más nueva. */
export function ColaIdentidades({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [pagina, setPagina] = useState(1);
  const [solicitudes, setSolicitudes] = useState<IdentidadEnCola[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(
    async (numero: number) => {
      setError(null);
      try {
        const cola = await cliente.listarIdentidades(numero, POR_PAGINA);
        setSolicitudes(cola.identidades);
        setTotal(cola.total);
      } catch (causa) {
        setError(mensajeDeError(causa, "No fue posible cargar la cola de revisión."));
      }
    },
    [cliente],
  );

  useEffect(() => {
    void cargar(pagina);
  }, [cargar, pagina]);

  function alResolver(id: string, mensaje: string) {
    const quedan = (solicitudes ?? []).filter((solicitud) => solicitud.id !== id);

    setAviso(mensaje);
    setTotal((actual) => Math.max(0, actual - 1));
    setSolicitudes(quedan);

    // Se vació la página: si había páginas anteriores se vuelve a la previa
    // (el efecto la carga); si era la primera, se recarga por si llegaron más.
    // Va fuera de los setState a propósito: sus funciones deben ser puras,
    // y StrictMode las ejecuta dos veces en desarrollo.
    if (quedan.length === 0) {
      if (pagina > 1) setPagina(pagina - 1);
      else void cargar(1);
    }
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Verificación de identidad
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        Compara el nombre y el RUT de la cuenta con la cédula. Al aprobar o rechazar, el documento se
        elimina del almacenamiento.
      </p>

      {aviso && (
        <p role="status" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
          {aviso}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {!error && solicitudes === null && <p className="mt-4 text-sm text-texto-suave">Cargando la cola…</p>}

      {solicitudes?.length === 0 && !error && (
        <p className="mt-4 rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">
          No hay identidades pendientes de revisión.
        </p>
      )}

      {solicitudes && solicitudes.length > 0 && (
        <>
          <p className="mt-4 text-sm text-texto-suave">
            {total} {total === 1 ? "pendiente" : "pendientes"}
          </p>
          <div className="mt-3 space-y-4">
            {solicitudes.map((solicitud) => (
              <SolicitudIdentidad key={solicitud.id} solicitud={solicitud} cliente={cliente} alResolver={alResolver} />
            ))}
          </div>
        </>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas de la cola" className="mt-5 flex items-center justify-between gap-3 text-sm">
          <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </Boton>
          <span className="text-texto-suave">
            Página {pagina} de {paginas}
          </span>
          <Boton type="button" variante="secundario" className="w-auto! px-5" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
            Siguiente
          </Boton>
        </nav>
      )}
    </section>
  );
}
