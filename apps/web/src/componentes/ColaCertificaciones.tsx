import { useCallback, useEffect, useId, useState } from "react";
import { formatearRut, LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION, LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION } from "@localcl/shared";
import { ErrorApi, type CertificacionEnCola, type ClienteApi } from "../api/cliente";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { formatearVigencia } from "./Certificaciones";

const POR_PAGINA = 10;

function mensajeDeError(causa: unknown, porDefecto: string): string {
  return causa instanceof ErrorApi ? causa.message : porDefecto;
}

const formatoHora = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });
const formatoFecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

/**
 * Una certificación de la cola: lo que declaró el prestador, el documento a
 * pedido y la decisión. Como con la cédula, el documento se pide solo cuando
 * el administrador lo abre (cada vista queda registrada) y la URL se
 * descarta al decidir.
 */
function SolicitudCertificacion({
  solicitud,
  cliente,
  alResolver,
}: {
  solicitud: CertificacionEnCola;
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

  const { nombre, rut } = solicitud.prestador;

  async function verDocumento() {
    setError(null);
    setImagenFallo(false);
    setOcupado("documento");
    try {
      setDocumento(await cliente.obtenerDocumentoCertificacion(solicitud.id));
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
      await cliente.aprobarCertificacion(solicitud.id);
      alResolver(solicitud.id, `Certificación «${solicitud.nombre}» de ${nombre} aprobada. El documento fue eliminado.`);
    } catch (causa) {
      setError(mensajeDeError(causa, "No fue posible aprobar la certificación."));
      setOcupado(null);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION) {
      setErrorMotivo(`Indica el motivo del rechazo (al menos ${LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION} caracteres): el prestador lo leerá.`);
      return;
    }
    setErrorMotivo(undefined);
    setError(null);
    setOcupado("rechazar");
    try {
      await cliente.rechazarCertificacion(solicitud.id, motivo.trim());
      alResolver(solicitud.id, `Certificación «${solicitud.nombre}» de ${nombre} rechazada. El documento fue eliminado.`);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.mensajeDe("motivo")) {
        setErrorMotivo(causa.mensajeDe("motivo"));
      } else {
        setError(mensajeDeError(causa, "No fue posible rechazar la certificación."));
      }
      setOcupado(null);
    }
  }

  return (
    <article aria-labelledby={idNombre} className="rounded-medio border border-borde p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={idNombre} className="font-titulos text-base font-bold break-words text-noche">
          {solicitud.nombre}
        </h3>
        <p className="text-sm text-texto-suave">Enviada el {formatoFecha.format(new Date(solicitud.enviadaEn))}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-texto-suave">Prestador</dt>
        <dd className="font-medium break-words text-noche">{nombre}</dd>
        <dt className="text-texto-suave">RUT de la cuenta</dt>
        <dd className="text-noche">{rut ? formatearRut(rut) : "No informado"}</dd>
        <dt className="text-texto-suave">Emisor</dt>
        <dd className="break-words text-noche">
          {solicitud.emisor}
          {solicitud.tipo === "OTRA" && <span className="text-texto-suave"> (indicado por el prestador)</span>}
        </dd>
        <dt className="text-texto-suave">Número</dt>
        <dd className="font-medium break-all text-noche">{solicitud.identificador}</dd>
        <dt className="text-texto-suave">Vigencia</dt>
        <dd className="text-noche">{solicitud.vigenteHasta ? `Hasta el ${formatearVigencia(solicitud.vigenteHasta)}` : "Sin vencimiento"}</dd>
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
              alt={`Documento de la certificación «${solicitud.nombre}» de ${nombre}`}
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
            id={`motivo-certificacion-${solicitud.id}`}
            etiqueta="Motivo del rechazo"
            valor={motivo}
            alCambiar={(valor) => {
              setMotivo(valor);
              setErrorMotivo(undefined);
            }}
            minimo={LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION}
            maximo={LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION}
            error={errorMotivo}
            ayuda="El prestador verá este texto. Dile qué corregir, por ejemplo: «el folio no aparece en el registro»."
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

/** Cola de certificaciones pendientes, de la más antigua a la más nueva. */
export function ColaCertificaciones({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [pagina, setPagina] = useState(1);
  const [solicitudes, setSolicitudes] = useState<CertificacionEnCola[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(
    async (numero: number) => {
      setError(null);
      try {
        const cola = await cliente.listarCertificacionesPendientes(numero, POR_PAGINA);
        setSolicitudes(cola.certificaciones);
        setTotal(cola.total);
      } catch (causa) {
        setError(mensajeDeError(causa, "No fue posible cargar las certificaciones pendientes."));
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

    // Igual que la cola de identidades: página vacía, a la anterior o se recarga.
    if (quedan.length === 0) {
      if (pagina > 1) setPagina(pagina - 1);
      else void cargar(1);
    }
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Certificaciones
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        Compara el documento con lo que declaró el prestador y, si puedes, con el registro del emisor. Al
        aprobar, su perfil y sus servicios muestran «Prestador con certificaciones». Al aprobar o
        rechazar, el documento se elimina del almacenamiento.
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

      {!error && solicitudes === null && <p className="mt-4 text-sm text-texto-suave">Cargando las certificaciones…</p>}

      {solicitudes?.length === 0 && !error && (
        <p className="mt-4 rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">No hay certificaciones pendientes de revisión.</p>
      )}

      {solicitudes && solicitudes.length > 0 && (
        <>
          <p className="mt-4 text-sm text-texto-suave">
            {total} {total === 1 ? "pendiente" : "pendientes"}
          </p>
          <div className="mt-3 space-y-4">
            {solicitudes.map((solicitud) => (
              <SolicitudCertificacion key={solicitud.id} solicitud={solicitud} cliente={cliente} alResolver={alResolver} />
            ))}
          </div>
        </>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas de las certificaciones" className="mt-5 flex items-center justify-between gap-3 text-sm">
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
