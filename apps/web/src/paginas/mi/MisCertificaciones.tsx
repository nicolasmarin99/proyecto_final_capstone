import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  CODIGO_CERTIFICACION_OTRA,
  LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MAXIMO_NOMBRE_CERTIFICACION,
  LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MINIMO_NOMBRE_CERTIFICACION,
  TAMANO_MAXIMO_DOCUMENTO,
  TIPOS_DOCUMENTO_PERMITIDOS,
} from "@localcl/shared";
import { ErrorApi, type Certificacion, type DatosCertificacion, type EstadoVerificacion, type TipoCertificacion } from "../../api/cliente";
import { useAuth } from "../../auth/ContextoAuth";
import { CompletarPerfilPrimero, SeccionArea } from "../../componentes/AreaPrestador";
import { Boton } from "../../componentes/Boton";
import { CampoSelector } from "../../componentes/CampoSelector";
import { CampoTexto } from "../../componentes/CampoTexto";
import { formatearVigencia } from "../../componentes/Certificaciones";
import { Icono } from "../../componentes/iconos";
import { MensajeCampo, mensajeVisible } from "../../componentes/MensajeCampo";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";

const MEGAS = TAMANO_MAXIMO_DOCUMENTO / (1024 * 1024);
const TIPOS_PERMITIDOS: readonly string[] = TIPOS_DOCUMENTO_PERMITIDOS;
const VACIO: DatosCertificacion = { tipo: "", identificador: "", vigenteHasta: "", nombre: "", emisor: "" };

type Campo = keyof DatosCertificacion | "documento";
type Errores = Partial<Record<Campo, string>>;
const CAMPOS: readonly Campo[] = ["tipo", "identificador", "vigenteHasta", "nombre", "emisor", "documento"];

/** Hoy en Chile como AAAA-MM-DD: la misma comparación que hace la API. */
function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

/**
 * Revisión en el navegador para avisar antes de gastar un envío. La API
 * vuelve a revisar todo, y el tipo del archivo lo decide por su contenido.
 */
function revisar(datos: DatosCertificacion, tipo: TipoCertificacion | undefined, archivo: File | null): Errores {
  const errores: Errores = {};
  const otra = datos.tipo === CODIGO_CERTIFICACION_OTRA;

  if (!tipo) errores.tipo = "Elige el tipo de certificación.";
  const identificador = datos.identificador.trim().length;
  if (identificador < LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION || identificador > LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION) {
    errores.identificador = `Indica el número o folio (entre ${LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION} y ${LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION} caracteres).`;
  }
  if (tipo?.requiereVigencia && !datos.vigenteHasta) errores.vigenteHasta = "Esta certificación vence: indica hasta cuándo está vigente.";
  if (datos.vigenteHasta && datos.vigenteHasta < hoyEnChile()) errores.vigenteHasta = "Esa certificación ya venció: sube una vigente.";
  if (otra) {
    for (const campo of ["nombre", "emisor"] as const) {
      const largo = datos[campo].trim().length;
      if (largo < LARGO_MINIMO_NOMBRE_CERTIFICACION || largo > LARGO_MAXIMO_NOMBRE_CERTIFICACION) {
        errores[campo] =
          campo === "nombre"
            ? `Escribe el nombre de la certificación (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`
            : `Escribe quién la emite (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`;
      }
    }
  }
  if (!archivo) errores.documento = "Adjunta la foto o el documento que acredita la certificación.";
  else if (archivo.size > TAMANO_MAXIMO_DOCUMENTO) errores.documento = `El archivo supera los ${MEGAS} MB.`;
  else if (!TIPOS_PERMITIDOS.includes(archivo.type)) errores.documento = "El archivo debe ser JPG, PNG o PDF.";

  return errores;
}

const ESTADOS: Partial<Record<EstadoVerificacion, { texto: string; clases: string }>> = {
  PENDIENTE: { texto: "En revisión", clases: "bg-hielo text-primario" },
  VERIFICADA: { texto: "Aprobada", clases: "bg-exito-50 text-exito-700" },
  RECHAZADA: { texto: "Rechazada", clases: "bg-error-50 text-error-700" },
  VENCIDA: { texto: "Vencida", clases: "bg-alerta-50 text-alerta-700" },
};

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

/** Una certificación propia, con su estado en texto (el color solo no basta). */
function FilaCertificacion({ certificacion }: { certificacion: Certificacion }) {
  // Aprobada pero ya vencida: el público no la ve, y el prestador tiene que saberlo.
  const vencida =
    certificacion.estado === "VERIFICADA" && certificacion.vigenteHasta !== null && certificacion.vigenteHasta.slice(0, 10) < hoyEnChile();
  const estado = ESTADOS[vencida ? "VENCIDA" : certificacion.estado] ?? { texto: certificacion.estado, clases: "bg-niebla text-noche" };

  return (
    <li className="rounded-medio border border-borde p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-noche">{certificacion.nombre}</p>
          <p className="text-sm break-words text-texto-suave">{certificacion.emisor}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.texto}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        <dt className="text-texto-suave">Número</dt>
        <dd className="break-all text-noche">{certificacion.identificador}</dd>
        <dt className="text-texto-suave">Vigencia</dt>
        <dd className="text-noche">{certificacion.vigenteHasta ? `Hasta el ${formatearVigencia(certificacion.vigenteHasta)}` : "Sin vencimiento"}</dd>
        <dt className="text-texto-suave">Enviada</dt>
        <dd className="text-noche">{fecha.format(new Date(certificacion.enviadaEn))}</dd>
      </dl>
      {certificacion.estado === "RECHAZADA" && certificacion.motivoRechazo && (
        <p className="mt-3 rounded-chico bg-error-50 px-3 py-2 text-sm text-error-700">
          <span className="font-semibold">Motivo:</span> {certificacion.motivoRechazo}
        </p>
      )}
      {certificacion.estado === "VERIFICADA" && !vencida && (
        <p className="mt-3 text-sm text-exito-700">Se muestra en tu perfil público y en tus servicios.</p>
      )}
    </li>
  );
}

/**
 * /mi/certificaciones: el prestador sube una certificación (formulario y
 * documento) y sigue su revisión. Un administrador la aprueba o rechaza; si
 * la aprueba, su perfil y sus servicios muestran «Prestador con
 * certificaciones».
 */
export default function PaginaMisCertificaciones() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();
  const idArchivo = useId();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [tipos, setTipos] = useState<TipoCertificacion[] | null>(null);
  const [certificaciones, setCertificaciones] = useState<Certificacion[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [datos, setDatos] = useState<DatosCertificacion>(VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const tienePerfil = estado !== null && !estado.cargando && estado.perfil !== null;

  useEffect(() => {
    if (!tienePerfil) return;
    let cancelado = false;

    Promise.all([cliente.listarTiposCertificacion(), cliente.listarMisCertificaciones()])
      .then(([catalogo, propias]) => {
        if (cancelado) return;
        setTipos(catalogo);
        setCertificaciones(propias);
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, tienePerfil]);

  const tipo = tipos?.find((candidato) => candidato.codigo === datos.tipo);
  const otra = datos.tipo === CODIGO_CERTIFICACION_OTRA;

  function cambiar(campo: keyof DatosCertificacion, valor: string) {
    setDatos((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
    setAviso(null);
  }

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setAviso(null);
    const problemas = revisar(datos, tipo, archivo);
    setErrores(problemas);
    if (Object.keys(problemas).length > 0 || !archivo) return;

    setEnviando(true);
    try {
      // Nombre y emisor solo viajan con «Otra»: el resto los pone el catálogo.
      const enviada = await cliente.subirCertificacion(otra ? datos : { ...datos, nombre: "", emisor: "" }, archivo);
      setCertificaciones((actuales) => [enviada, ...(actuales ?? [])]);
      setDatos(VACIO);
      setArchivo(null);
      if (archivoRef.current) archivoRef.current.value = "";
      setAviso("Certificación enviada. Un administrador la revisará y verás el resultado aquí.");
      void estado?.recargar();
    } catch (causa) {
      const delServidor: Errores = {};
      if (causa instanceof ErrorApi) {
        for (const detalle of causa.detalles) {
          const campo = CAMPOS.find((candidato) => candidato === detalle.campo);
          if (campo) delServidor[campo] = detalle.mensaje;
        }
      }
      if (Object.keys(delServidor).length > 0) {
        setErrores(delServidor);
      } else {
        setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  const idMensajeArchivo = `${idArchivo}-mensaje`;
  const mensajesArchivo = { error: errores.documento, ayuda: "Una foto del certificado o el PDF. Que se lean bien tu nombre y el número." };

  return (
    <SeccionArea
      titulo="Certificaciones"
      bajada="Sube tus certificaciones de oficio. Cuando un administrador las apruebe, tu perfil y tus servicios mostrarán «Prestador con certificaciones»."
    >
      {estado === null || estado.cargando ? (
        <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil…</p>
      ) : estado.perfil === null ? (
        <CompletarPerfilPrimero motivo="Necesitamos tus datos de prestador antes de revisar tus certificaciones." />
      ) : errorCarga ? (
        <p role="alert" className="mt-6 text-sm text-error-700">
          No fue posible cargar tus certificaciones. Recarga la página para intentarlo de nuevo.
        </p>
      ) : tipos === null || certificaciones === null ? (
        <p className="mt-6 text-sm text-texto-suave">Cargando tus certificaciones…</p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="titulo-nueva">
            <h2 id="titulo-nueva" className="font-titulos text-lg font-bold text-noche">
              Nueva certificación
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-texto-suave">
              <li className="flex gap-2">
                <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
                El documento solo lo ve un administrador, y se elimina al terminar la revisión.
              </li>
              <li className="flex gap-2">
                <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
                El público ve el nombre, quién la emite y su vigencia. Nunca el documento ni el número.
              </li>
            </ul>

            {aviso && (
              <p role="status" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
                {aviso}
              </p>
            )}
            {errorGeneral && (
              <p role="alert" className="motion-safe:animate-aparecer-corto mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
                {errorGeneral}
              </p>
            )}

            <form onSubmit={alEnviar} noValidate>
              <CampoSelector
                id="certificacion-tipo"
                etiqueta="Tipo de certificación"
                valor={datos.tipo}
                alCambiar={(valor) => cambiar("tipo", valor)}
                vacio="Elige una"
                opciones={tipos.map((opcion) => ({ valor: opcion.codigo, texto: opcion.nombre }))}
                error={errores.tipo}
                ayuda={tipo && !otra ? `Emite: ${tipo.emisor}` : "¿No está en la lista? Elige «Otra certificación»."}
              />
              {otra && (
                <>
                  <CampoTexto
                    id="certificacion-nombre"
                    etiqueta="Nombre de la certificación"
                    autoComplete="off"
                    valor={datos.nombre}
                    alCambiar={(valor) => cambiar("nombre", valor)}
                    error={errores.nombre}
                    ayuda="Por ejemplo: Técnico en climatización."
                  />
                  <CampoTexto
                    id="certificacion-emisor"
                    etiqueta="Quién la emite"
                    autoComplete="off"
                    valor={datos.emisor}
                    alCambiar={(valor) => cambiar("emisor", valor)}
                    error={errores.emisor}
                    ayuda="La institución u organismo: INACAP, un OTEC, una municipalidad…"
                  />
                </>
              )}
              <CampoTexto
                id="certificacion-identificador"
                etiqueta="Número, folio o código"
                autoComplete="off"
                valor={datos.identificador}
                alCambiar={(valor) => cambiar("identificador", valor)}
                error={errores.identificador}
                ayuda="El que aparece en el certificado. Solo lo ve el administrador."
              />
              <CampoTexto
                id="certificacion-vigencia"
                etiqueta={tipo?.requiereVigencia ? "Vigente hasta" : "Vigente hasta (opcional)"}
                tipo="date"
                autoComplete="off"
                valor={datos.vigenteHasta}
                alCambiar={(valor) => cambiar("vigenteHasta", valor)}
                error={errores.vigenteHasta}
                ayuda={tipo?.requiereVigencia ? "Esta certificación vence: la fecha es obligatoria." : "Déjalo vacío si no vence."}
              />

              <div className="mt-5">
                <label htmlFor={idArchivo} className="block text-sm font-bold text-noche">
                  Documento que la acredita (JPG, PNG o PDF, hasta {MEGAS} MB)
                </label>
                <input
                  ref={archivoRef}
                  id={idArchivo}
                  name="documento"
                  type="file"
                  accept={TIPOS_DOCUMENTO_PERMITIDOS.join(",")}
                  onChange={(evento) => {
                    setArchivo(evento.target.files?.[0] ?? null);
                    setErrores((actuales) => ({ ...actuales, documento: undefined }));
                  }}
                  aria-invalid={errores.documento ? true : undefined}
                  aria-describedby={mensajeVisible(mensajesArchivo) ? idMensajeArchivo : undefined}
                  className="mt-1.5 block w-full cursor-pointer rounded-chico border border-borde-fuerte bg-niebla text-sm text-noche file:mr-4 file:cursor-pointer file:rounded-l-chico file:border-0 file:bg-hielo file:px-4 file:py-3 file:font-semibold file:text-primario hover:file:bg-borde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
                />
                <MensajeCampo id={idMensajeArchivo} mensajes={mensajesArchivo} />
              </div>

              <Boton type="submit" cargando={enviando} className="mt-6">
                {enviando ? "Enviando…" : "Enviar a revisión"}
              </Boton>
            </form>
          </section>

          <section aria-labelledby="titulo-mias">
            <h2 id="titulo-mias" className="font-titulos text-lg font-bold text-noche">
              Mis certificaciones
            </h2>
            {certificaciones.length === 0 ? (
              <p className="mt-3 rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">Todavía no has enviado certificaciones.</p>
            ) : (
              <ul aria-label="Mis certificaciones" className="mt-3 space-y-3">
                {certificaciones.map((certificacion) => (
                  <FilaCertificacion key={certificacion.id} certificacion={certificacion} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </SeccionArea>
  );
}
