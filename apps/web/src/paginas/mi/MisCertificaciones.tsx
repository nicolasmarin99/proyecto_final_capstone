import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  CODIGO_CERTIFICACION_OTRA,
  CODIGO_CURSO,
  HORAS_MAXIMAS_CURSO,
  HORAS_MINIMAS_CURSO,
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
import { formatearDia } from "../../componentes/Certificaciones";
import { Icono } from "../../componentes/iconos";
import { MensajeCampo, mensajeVisible } from "../../componentes/MensajeCampo";
import { useEstadoPrestador } from "../../prestador/ContextoPrestador";

const MEGAS = TAMANO_MAXIMO_DOCUMENTO / (1024 * 1024);
const TIPOS_PERMITIDOS: readonly string[] = TIPOS_DOCUMENTO_PERMITIDOS;
const VACIO: DatosCertificacion = { tipo: "", identificador: "", vigenteHasta: "", nombre: "", emisor: "", fechaTermino: "", horas: "" };

type Clase = "CERTIFICACION" | "CURSO";
type Campo = keyof DatosCertificacion | "documento";
type Errores = Partial<Record<Campo, string>>;

/** Los campos que el formulario muestra según lo que se está subiendo. */
function camposVisibles(clase: Clase, otra: boolean): Campo[] {
  if (clase === "CURSO") return ["nombre", "emisor", "fechaTermino", "horas", "identificador", "documento"];
  return ["tipo", ...(otra ? (["nombre", "emisor"] as const) : []), "identificador", "vigenteHasta", "documento"];
}

/** Hoy en Chile como AAAA-MM-DD: la misma comparación que hace la API. */
function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function largoFuera(valor: string, minimo: number, maximo: number): boolean {
  const largo = valor.trim().length;
  return largo < minimo || largo > maximo;
}

/**
 * Revisión en el navegador para avisar antes de gastar un envío. La API
 * vuelve a revisar todo, y el tipo del archivo lo decide por su contenido.
 */
function revisar(clase: Clase, datos: DatosCertificacion, tipo: TipoCertificacion | undefined, archivo: File | null): Errores {
  const errores: Errores = {};
  const curso = clase === "CURSO";
  const nombrePropio = curso || datos.tipo === CODIGO_CERTIFICACION_OTRA;

  if (!curso && !tipo) errores.tipo = "Elige el tipo de certificación.";
  // El folio es obligatorio en una certificación; en un curso, solo se revisa si viene.
  if (
    (!curso || datos.identificador.trim() !== "") &&
    largoFuera(datos.identificador, LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION, LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION)
  ) {
    errores.identificador = `Indica el número o folio (entre ${LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION} y ${LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION} caracteres).`;
  }
  if (nombrePropio) {
    if (largoFuera(datos.nombre, LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION)) {
      errores.nombre = curso
        ? `Escribe el nombre del curso (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`
        : `Escribe el nombre de la certificación (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`;
    }
    if (largoFuera(datos.emisor, LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION)) {
      errores.emisor = curso
        ? `Escribe la institución que dictó el curso (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`
        : `Escribe quién la emite (al menos ${LARGO_MINIMO_NOMBRE_CERTIFICACION} caracteres).`;
    }
  }
  if (curso) {
    if (!datos.fechaTermino) errores.fechaTermino = "Indica cuándo terminaste el curso.";
    else if (datos.fechaTermino > hoyEnChile()) errores.fechaTermino = "La fecha de término no puede ser futura.";
    if (datos.horas.trim() !== "") {
      const horas = Number(datos.horas);
      if (!Number.isInteger(horas) || horas < HORAS_MINIMAS_CURSO || horas > HORAS_MAXIMAS_CURSO) {
        errores.horas = `Indica las horas como un número entero entre ${HORAS_MINIMAS_CURSO} y ${HORAS_MAXIMAS_CURSO}.`;
      }
    }
  } else {
    if (tipo?.requiereVigencia && !datos.vigenteHasta) errores.vigenteHasta = "Esta certificación vence: indica hasta cuándo está vigente.";
    if (datos.vigenteHasta && datos.vigenteHasta < hoyEnChile()) errores.vigenteHasta = "Esa certificación ya venció: sube una vigente.";
  }
  if (!archivo) errores.documento = curso ? "Adjunta el certificado o diploma del curso." : "Adjunta la foto o el documento que acredita la certificación.";
  else if (archivo.size > TAMANO_MAXIMO_DOCUMENTO) errores.documento = `El archivo supera los ${MEGAS} MB.`;
  else if (!TIPOS_PERMITIDOS.includes(archivo.type)) errores.documento = "El archivo debe ser JPG, PNG o PDF.";

  return errores;
}

/** Solo lo que corresponde a cada clase viaja a la API; el resto va vacío (y no se envía). */
function datosAEnviar(clase: Clase, datos: DatosCertificacion): DatosCertificacion {
  if (clase === "CURSO") return { ...datos, tipo: CODIGO_CURSO, vigenteHasta: "" };
  const otra = datos.tipo === CODIGO_CERTIFICACION_OTRA;
  return { ...datos, nombre: otra ? datos.nombre : "", emisor: otra ? datos.emisor : "", fechaTermino: "", horas: "" };
}

const ESTADOS: Partial<Record<EstadoVerificacion, { texto: string; clases: string }>> = {
  PENDIENTE: { texto: "En revisión", clases: "bg-hielo text-primario" },
  VERIFICADA: { texto: "Aprobada", clases: "bg-exito-50 text-exito-700" },
  RECHAZADA: { texto: "Rechazada", clases: "bg-error-50 text-error-700" },
  VENCIDA: { texto: "Vencida", clases: "bg-alerta-50 text-alerta-700" },
};

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

/** Una certificación o curso propio, con su estado en texto (el color solo no basta). */
function FilaCertificacion({ certificacion }: { certificacion: Certificacion }) {
  const curso = certificacion.clase === "CURSO";
  // Aprobada pero ya vencida: el público no la ve, y el prestador tiene que saberlo.
  const vencida =
    certificacion.estado === "VERIFICADA" && certificacion.vigenteHasta !== null && certificacion.vigenteHasta.slice(0, 10) < hoyEnChile();
  const estado = ESTADOS[vencida ? "VENCIDA" : certificacion.estado] ?? { texto: certificacion.estado, clases: "bg-niebla text-noche" };

  return (
    <li className="rounded-medio border border-borde p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.8px] text-primario uppercase">{curso ? "Curso" : "Certificación"}</p>
          <p className="font-semibold break-words text-noche">{certificacion.nombre}</p>
          <p className="text-sm break-words text-texto-suave">{certificacion.emisor}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.texto}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        <dt className="text-texto-suave">{curso ? "Folio" : "Número"}</dt>
        <dd className="break-all text-noche">{certificacion.identificador ?? "Sin folio"}</dd>
        {curso ? (
          <>
            <dt className="text-texto-suave">Terminado</dt>
            <dd className="text-noche">{certificacion.fechaTermino ? formatearDia(certificacion.fechaTermino) : "—"}</dd>
            <dt className="text-texto-suave">Horas</dt>
            <dd className="text-noche">{certificacion.horas ?? "No indicadas"}</dd>
          </>
        ) : (
          <>
            <dt className="text-texto-suave">Vigencia</dt>
            <dd className="text-noche">{certificacion.vigenteHasta ? `Hasta el ${formatearDia(certificacion.vigenteHasta)}` : "Sin vencimiento"}</dd>
          </>
        )}
        <dt className="text-texto-suave">Enviada</dt>
        <dd className="text-noche">{fecha.format(new Date(certificacion.enviadaEn))}</dd>
      </dl>
      {certificacion.estado === "RECHAZADA" && certificacion.motivoRechazo && (
        <p className="mt-3 rounded-chico bg-error-50 px-3 py-2 text-sm text-error-700">
          <span className="font-semibold">Motivo:</span> {certificacion.motivoRechazo}
        </p>
      )}
      {certificacion.estado === "VERIFICADA" && !vencida && (
        <p className="mt-3 text-sm text-exito-700">
          {curso ? "Se muestra en la sección «Cursos» de tu perfil y tus servicios." : "Se muestra en tu perfil público y en tus servicios."}
        </p>
      )}
    </li>
  );
}

/** Elección entre certificación y curso: dos opciones de radio con aspecto de tarjeta. */
function SelectorClase({ clase, alCambiar }: { clase: Clase; alCambiar(clase: Clase): void }) {
  const opciones: { valor: Clase; texto: string; ayuda: string }[] = [
    { valor: "CERTIFICACION", texto: "Certificación", ayuda: "Licencias y certificaciones de oficio (SEC, ChileValora…)" },
    { valor: "CURSO", texto: "Curso", ayuda: "Cursos y capacitaciones que hayas terminado" },
  ];

  return (
    <fieldset className="mt-5">
      <legend className="text-sm font-bold text-noche">¿Qué quieres subir?</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {opciones.map((opcion) => (
          <label
            key={opcion.valor}
            className={`flex min-h-12 cursor-pointer gap-3 rounded-chico border px-4 py-3 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primario ${
              clase === opcion.valor ? "border-primario bg-hielo" : "border-borde-fuerte bg-niebla hover:border-primario"
            }`}
          >
            <input
              type="radio"
              name="clase"
              value={opcion.valor}
              checked={clase === opcion.valor}
              onChange={() => alCambiar(opcion.valor)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primario"
            />
            <span>
              <span className="block font-semibold text-noche">{opcion.texto}</span>
              <span className="block text-texto-suave">{opcion.ayuda}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * /mi/certificaciones: el prestador sube una certificación o un curso
 * (formulario y documento) y sigue su revisión. Un administrador lo aprueba
 * o lo rechaza. Una certificación aprobada enciende «Prestador con
 * certificaciones»; un curso aprobado aparece en la sección «Cursos».
 */
export default function PaginaMisCertificaciones() {
  const { cliente } = useAuth();
  const estado = useEstadoPrestador();
  const idArchivo = useId();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [tipos, setTipos] = useState<TipoCertificacion[] | null>(null);
  const [certificaciones, setCertificaciones] = useState<Certificacion[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [clase, setClase] = useState<Clase>("CERTIFICACION");
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

  const curso = clase === "CURSO";
  // El curso tiene su propia opción arriba: no se repite en la lista de certificaciones.
  const tiposCertificacion = (tipos ?? []).filter((opcion) => opcion.codigo !== CODIGO_CURSO);
  // Solo se ofrece «Curso» si el servidor lo tiene en su catálogo: si no, la
  // API rechazaría el envío (pasa en una base sin seed:maestros).
  const cursosDisponibles = (tipos ?? []).some((opcion) => opcion.codigo === CODIGO_CURSO);
  const tipo = curso ? undefined : tiposCertificacion.find((candidato) => candidato.codigo === datos.tipo);
  const otra = !curso && datos.tipo === CODIGO_CERTIFICACION_OTRA;

  function cambiar(campo: keyof DatosCertificacion, valor: string) {
    setDatos((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
    setAviso(null);
  }

  function cambiarClase(nueva: Clase) {
    setClase(nueva);
    setErrores({});
    setErrorGeneral(null);
    setAviso(null);
  }

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    setAviso(null);
    const problemas = revisar(clase, datos, tipo, archivo);
    setErrores(problemas);
    if (Object.keys(problemas).length > 0 || !archivo) return;

    setEnviando(true);
    try {
      const enviada = await cliente.subirCertificacion(datosAEnviar(clase, datos), archivo);
      setCertificaciones((actuales) => [enviada, ...(actuales ?? [])]);
      setDatos(VACIO);
      setArchivo(null);
      if (archivoRef.current) archivoRef.current.value = "";
      setAviso(
        curso
          ? "Curso enviado. Un administrador lo revisará y verás el resultado aquí."
          : "Certificación enviada. Un administrador la revisará y verás el resultado aquí.",
      );
      void estado?.recargar();
    } catch (causa) {
      // Cada error va bajo su campo, pero solo si ese campo está en pantalla:
      // con «Curso» no se ve el selector de tipo, y un error colgado de un
      // campo invisible no lo lee nadie. Esos se muestran junto al botón.
      const enPantalla = camposVisibles(clase, otra);
      const delServidor: Errores = {};
      const sinCampo: string[] = [];
      if (causa instanceof ErrorApi) {
        for (const detalle of causa.detalles) {
          const campo = enPantalla.find((candidato) => candidato === detalle.campo);
          if (campo) delServidor[campo] = detalle.mensaje;
          else sinCampo.push(detalle.mensaje);
        }
      }
      setErrores(delServidor);
      if (sinCampo.length > 0) {
        setErrorGeneral(sinCampo.join(" "));
      } else if (Object.keys(delServidor).length === 0) {
        setErrorGeneral(causa instanceof ErrorApi ? causa.message : "No fue posible conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  const idMensajeArchivo = `${idArchivo}-mensaje`;
  const mensajesArchivo = {
    error: errores.documento,
    ayuda: curso
      ? "Una foto del certificado o diploma, o el PDF. Que se lean tu nombre y el del curso."
      : "Una foto del certificado o el PDF. Que se lean bien tu nombre y el número.",
  };

  return (
    <SeccionArea
      titulo="Certificaciones y cursos"
      bajada="Sube tus certificaciones de oficio y los cursos que hayas hecho. Cuando un administrador apruebe una certificación, tu perfil y tus servicios mostrarán «Prestador con certificaciones»; los cursos aprobados aparecen en su propia sección."
    >
      {estado === null || estado.cargando ? (
        <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil…</p>
      ) : estado.perfil === null ? (
        <CompletarPerfilPrimero motivo="Necesitamos tus datos de prestador antes de revisar tus certificaciones y cursos." />
      ) : errorCarga ? (
        <p role="alert" className="mt-6 text-sm text-error-700">
          No fue posible cargar tus certificaciones y cursos. Recarga la página para intentarlo de nuevo.
        </p>
      ) : tipos === null || certificaciones === null ? (
        <p className="mt-6 text-sm text-texto-suave">Cargando tus certificaciones y cursos…</p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="titulo-nueva">
            <h2 id="titulo-nueva" className="font-titulos text-lg font-bold text-noche">
              Nuevo envío
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-texto-suave">
              <li className="flex gap-2">
                <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
                El documento solo lo ve un administrador, y se elimina al terminar la revisión.
              </li>
              <li className="flex gap-2">
                <Icono nombre="escudo" tamano={18} className="mt-0.5 shrink-0 text-primario" />
                El público ve el nombre, quién lo emite y sus fechas. Nunca el documento ni el número.
              </li>
            </ul>

            <form onSubmit={alEnviar} noValidate aria-labelledby="titulo-nueva">
              {cursosDisponibles && <SelectorClase clase={clase} alCambiar={cambiarClase} />}

              {!curso && (
                <CampoSelector
                  id="certificacion-tipo"
                  etiqueta="Tipo de certificación"
                  valor={datos.tipo}
                  alCambiar={(valor) => cambiar("tipo", valor)}
                  vacio="Elige una"
                  opciones={tiposCertificacion.map((opcion) => ({ valor: opcion.codigo, texto: opcion.nombre }))}
                  error={errores.tipo}
                  ayuda={tipo && !otra ? `Emite: ${tipo.emisor}` : "¿No está en la lista? Elige «Otra certificación»."}
                />
              )}
              {(curso || otra) && (
                <>
                  <CampoTexto
                    id="certificacion-nombre"
                    etiqueta={curso ? "Nombre del curso" : "Nombre de la certificación"}
                    autoComplete="off"
                    valor={datos.nombre}
                    alCambiar={(valor) => cambiar("nombre", valor)}
                    error={errores.nombre}
                    ayuda={curso ? "Por ejemplo: Instalaciones eléctricas domiciliarias." : "Por ejemplo: Técnico en climatización."}
                  />
                  <CampoTexto
                    id="certificacion-emisor"
                    etiqueta={curso ? "Institución" : "Quién la emite"}
                    autoComplete="off"
                    valor={datos.emisor}
                    alCambiar={(valor) => cambiar("emisor", valor)}
                    error={errores.emisor}
                    ayuda={curso ? "Quién dictó el curso: INACAP, un OTEC, una municipalidad…" : "La institución u organismo: INACAP, un OTEC, una municipalidad…"}
                  />
                </>
              )}
              {curso && (
                <>
                  <CampoTexto
                    id="certificacion-termino"
                    etiqueta="Fecha de término"
                    tipo="date"
                    autoComplete="off"
                    valor={datos.fechaTermino}
                    alCambiar={(valor) => cambiar("fechaTermino", valor)}
                    error={errores.fechaTermino}
                    ayuda="Cuándo terminaste el curso."
                  />
                  <CampoTexto
                    id="certificacion-horas"
                    etiqueta="Horas (opcional)"
                    tipo="number"
                    inputMode="numeric"
                    autoComplete="off"
                    valor={datos.horas}
                    alCambiar={(valor) => cambiar("horas", valor)}
                    error={errores.horas}
                    ayuda="La duración que indica el certificado."
                  />
                </>
              )}
              <CampoTexto
                id="certificacion-identificador"
                etiqueta={curso ? "Folio o código (opcional)" : "Número, folio o código"}
                autoComplete="off"
                valor={datos.identificador}
                alCambiar={(valor) => cambiar("identificador", valor)}
                error={errores.identificador}
                ayuda={curso ? "Si el certificado trae uno. Solo lo ve el administrador." : "El que aparece en el certificado. Solo lo ve el administrador."}
              />
              {!curso && (
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
              )}

              <div className="mt-5">
                <label htmlFor={idArchivo} className="block text-sm font-bold text-noche">
                  {curso ? "Certificado del curso" : "Documento que la acredita"} (JPG, PNG o PDF, hasta {MEGAS} MB)
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

              {/*
                Junto al botón, no arriba del formulario: en el celular, quien
                acaba de tocar «Enviar» está mirando aquí abajo.
              */}
              {aviso && (
                <p role="status" className="motion-safe:animate-aparecer-corto mt-6 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
                  {aviso}
                </p>
              )}
              {errorGeneral && (
                <p role="alert" className="motion-safe:animate-aparecer-corto mt-6 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
                  {errorGeneral}
                </p>
              )}

              <Boton type="submit" cargando={enviando} className="mt-6">
                {enviando ? "Enviando…" : "Enviar a revisión"}
              </Boton>
            </form>
          </section>

          <section aria-labelledby="titulo-mias">
            <h2 id="titulo-mias" className="font-titulos text-lg font-bold text-noche">
              Mis certificaciones y cursos
            </h2>
            {certificaciones.length === 0 ? (
              <p className="mt-3 rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">Todavía no has enviado certificaciones ni cursos.</p>
            ) : (
              <ul aria-label="Mis certificaciones y cursos" className="mt-3 space-y-3">
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
