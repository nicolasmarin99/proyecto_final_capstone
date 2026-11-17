import { env } from "../../env.js";
import { ErrorHttp } from "../../shared/errores.js";
import { DocumentoNoEncontrado, obtenerAlmacenamiento, obtenerAlmacenamientoCertificaciones } from "../almacenamiento/index.js";
import { obtenerLectorDocumentos } from "./index.js";
import {
  buscarParaProcesar,
  camposGuardados,
  crearPendiente,
  credencialesPorLeer,
  extraccionConDeclarado,
  guardarExtraida,
  guardarFallida,
  tomarParaIntento,
} from "./lectura.repository.js";
import { soloCamposPermitidos, type TipoDocumentoLectura } from "./lectura.tipos.js";
import { alertasDe } from "./lectura.validacion.js";

/*
  Lectura automática de documentos: precarga los campos para la revisión.

  REGLA CENTRAL: NADA se aprueba automáticamente. Este servicio lee
  documentos y guarda lo leído como SUGERENCIA. No cambia el estado de
  ninguna credencial, ni puede: no importa ninguna función que lo haga. Un
  documento sin revisión humana nunca queda aprobado, pase lo que pase acá.
*/

const CODIGO_IDENTIDAD = "IDENTIDAD";
const CODIGO_CURSO = "CURSO";

/** Qué tipo de documento es, según el tipo de credencial. */
export function tipoDeDocumento(codigoTipoCredencial: string): TipoDocumentoLectura {
  if (codigoTipoCredencial === CODIGO_IDENTIDAD) return "CEDULA";
  return codigoTipoCredencial === CODIGO_CURSO ? "CURSO" : "CERTIFICADO";
}

/** Motivo corto para guardar con una FALLIDA: el nombre del error o su mensaje, nunca el documento. */
function motivoDe(error: unknown): string {
  if (error instanceof DocumentoNoEncontrado) return "El documento ya no está en el almacenamiento.";
  return error instanceof Error ? error.message : "Error desconocido.";
}

export type ResultadoLectura = "extraida" | "fallida" | "omitida";

/**
 * Lee el documento de una credencial y guarda lo leído. Nunca lanza: un
 * fallo queda como FALLIDA (con hasta MAXIMO_INTENTOS intentos en total).
 *
 * «omitida»: no había nada que hacer (lectura apagada, ya extraída, sin
 * intentos, o la solicitud ya se resolvió y su documento se borró).
 */
export async function leerDocumentoDe(credencialId: string): Promise<ResultadoLectura> {
  const lector = obtenerLectorDocumentos();
  if (!lector) return "omitida";

  let idExtraccion: string | null = null;
  try {
    const extraccion = await buscarParaProcesar(credencialId);
    // Solo se lee el documento de una solicitud todavía pendiente: las
    // resueltas ya no tienen documento (ni extracción).
    if (!extraccion || extraccion.credencial.estado !== "PENDIENTE") return "omitida";
    if (!(await tomarParaIntento(extraccion.id))) return "omitida";
    idExtraccion = extraccion.id;

    const esCedula = extraccion.credencial.tipo.codigo === CODIGO_IDENTIDAD;
    const almacenamiento = esCedula ? obtenerAlmacenamiento() : obtenerAlmacenamientoCertificaciones();
    const documento = await almacenamiento.leer(credencialId);

    // El filtro se aplica acá también, diga lo que diga el lector: de una
    // cédula solo pasan el nombre y el RUT.
    const campos = soloCamposPermitidos(extraccion.tipo, await lector.leer(documento, extraccion.tipo));
    await guardarExtraida(extraccion.id, campos, lector.modelo);
    return "extraida";
  } catch (error) {
    // Solo el id y el motivo: ni el documento ni lo leído van al log.
    console.error("No se pudo leer el documento; la solicitud sigue pendiente y se revisa a mano.", { credencialId }, motivoDe(error));
    if (idExtraccion) {
      try {
        await guardarFallida(idExtraccion, motivoDe(error));
      } catch {
        // Si ni eso se puede guardar, queda PENDIENTE y el script la retoma.
      }
    }
    return "fallida";
  }
}

/** Lecturas en segundo plano que todavía no terminan. */
const enCurso = new Set<Promise<unknown>>();

/**
 * Al subir un documento: deja la extracción PENDIENTE y lanza la lectura EN
 * SEGUNDO PLANO. Vuelve apenas quedó registrada: no espera al lector, así
 * que la respuesta al prestador no se demora, tarde o falle la lectura.
 * Nunca lanza: si algo falla acá, la solicitud ya está creada igual y el
 * script nocturno retoma la lectura.
 */
export async function iniciarLectura(credencialId: string, codigoTipoCredencial: string): Promise<void> {
  if (!obtenerLectorDocumentos()) return;

  try {
    await crearPendiente(credencialId, tipoDeDocumento(codigoTipoCredencial));
  } catch (error) {
    console.error("No se pudo registrar la extracción pendiente.", { credencialId }, motivoDe(error));
    return;
  }

  // Sin await: sigue después de responder. leerDocumentoDe() no lanza.
  const tarea = leerDocumentoDe(credencialId).finally(() => enCurso.delete(tarea));
  enCurso.add(tarea);
}

/** Espera a que terminen las lecturas en segundo plano (para las pruebas y para cerrar el script). */
export async function esperarLecturasEnCurso(): Promise<void> {
  while (enCurso.size > 0) await Promise.allSettled([...enCurso]);
}

export interface ResultadoLote {
  /** Documentos que había por leer. */
  porLeer: number;
  extraidas: number;
  fallidas: number;
  omitidas: number;
}

/**
 * Lee los documentos pendientes de lectura, de a `lote` por vez, de los más
 * antiguos a los más nuevos. Es lo que corre el script nocturno.
 *
 * Idempotente: un documento ya leído no se vuelve a leer, y uno que falla
 * se intenta a lo más MAXIMO_INTENTOS veces en total. Si todo está al día,
 * no llama al lector.
 */
export async function leerPendientes(opciones: { lote?: number } = {}): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { porLeer: 0, extraidas: 0, fallidas: 0, omitidas: 0 };
  if (!obtenerLectorDocumentos()) return resultado;

  const lote = opciones.lote ?? 10;
  // Cada documento se intenta a lo más una vez por corrida: uno que falla
  // no se reintenta hasta la próxima (y no bloquea el avance del lote).
  const vistos = new Set<string>();

  for (;;) {
    const pendientes = (await credencialesPorLeer(lote + vistos.size)).filter((credencial) => !vistos.has(credencial.id)).slice(0, lote);
    if (pendientes.length === 0) break;

    for (const credencial of pendientes) {
      vistos.add(credencial.id);
      resultado.porLeer += 1;
      await crearPendiente(credencial.id, tipoDeDocumento(credencial.tipo.codigo));
      const lectura = await leerDocumentoDe(credencial.id);
      if (lectura === "extraida") resultado.extraidas += 1;
      else if (lectura === "fallida") resultado.fallidas += 1;
      else resultado.omitidas += 1;
    }
  }

  return resultado;
}

/**
 * La extracción de una credencial, para el administrador que la revisa:
 * los campos leídos (con cuáles tienen confianza baja) y las ALERTAS de la
 * validación cruzada contra lo que declaró el prestador.
 *
 * `extraccion: null` si no hay lectura (apagada, o anterior a esta función):
 * el panel funciona igual, a mano.
 */
export async function extraccionParaRevisar(credencialId: string) {
  const credencial = await extraccionConDeclarado(credencialId);
  if (!credencial) {
    throw new ErrorHttp(404, "SOLICITUD_NO_ENCONTRADA", "No existe esa solicitud.");
  }

  const { extraccion } = credencial;
  if (!extraccion) return { extraccion: null };

  const campos = extraccion.estado === "EXTRAIDA" ? camposGuardados(extraccion.tipo, extraccion.campos) : [];

  return {
    extraccion: {
      tipo: extraccion.tipo,
      estado: extraccion.estado,
      modelo: extraccion.modelo,
      extraidaEn: extraccion.extraidaEn,
      campos: campos.map((campo) => ({
        campo: campo.campo,
        valor: campo.valor,
        confianza: campo.confianza,
        // Bajo el umbral, el panel lo destaca para que se mire con más cuidado.
        confianzaBaja: campo.confianza < env.LECTURA_UMBRAL_CONFIANZA,
      })),
      // No bloquean nada: el administrador las ve antes de decidir.
      alertas: alertasDe(campos, { nombre: credencial.prestador.usuario.nombre, rut: credencial.prestador.usuario.rut }),
    },
  };
}
