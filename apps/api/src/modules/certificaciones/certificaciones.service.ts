import { randomUUID } from "node:crypto";
import { CODIGO_CERTIFICACION_OTRA, MAXIMO_CERTIFICACIONES_POR_DIA } from "@localcl/shared";
import type { EstadoCredencial } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import { DocumentoNoEncontrado, obtenerAlmacenamientoCertificaciones } from "../almacenamiento/index.js";
import { DocumentoMalFormado, detectarTipo, quitarMetadatos } from "../identidad/identidad.documento.js";
import {
  buscarCertificacion,
  buscarPerfilDelUsuario,
  certificacionesDe,
  colaCertificaciones,
  registrarAccesoDocumento,
  registrarEnvio,
  resolverCertificacion,
  revisarEnvio,
  tiposCertificables,
  type DecisionCertificacion,
  type ResultadoEnvio,
} from "./certificaciones.repository.js";
import type { DatosCertificacion } from "./certificaciones.schema.js";

/*
  Certificaciones del prestador: el mismo flujo que la cédula de identidad
  (identidad.service.ts), con otro catálogo y otra carpeta:
  - el tipo de archivo se decide por sus bytes y se le quitan los metadatos
    antes de guardarlo; el nombre lo genera el servidor (es el id);
  - el documento es privado: solo lo ve un administrador, con una URL que
    vence, y cada vista queda registrada;
  - al aprobar o rechazar, el documento se borra del almacenamiento.
*/

const DURACION_URL_SEGUNDOS = 5 * 60;
const VENTANA_MS = 24 * 60 * 60 * 1000;

function errorCampo(campo: string, mensaje: string): ErrorHttp {
  return new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [{ campo, mensaje }]);
}

function errorDeEnvio(resultado: Exclude<ResultadoEnvio, "permitido">): ErrorHttp {
  return resultado === "pendiente"
    ? new ErrorHttp(409, "CERTIFICACION_PENDIENTE", "Ya enviaste esta certificación y está en revisión. Espera el resultado.")
    : new ErrorHttp(
        429,
        "DEMASIADOS_ENVIOS",
        `Puedes enviar hasta ${MAXIMO_CERTIFICACIONES_POR_DIA} certificaciones en 24 horas. Inténtalo más tarde.`,
      );
}

/** Cómo sale una certificación para su dueño y para el administrador. */
function vista(certificacion: Awaited<ReturnType<typeof certificacionesDe>>[number]) {
  return {
    id: certificacion.id,
    tipo: certificacion.tipo.codigo,
    nombre: certificacion.nombrePersonalizado ?? certificacion.tipo.nombre,
    emisor: certificacion.emisorPersonalizado ?? certificacion.tipo.fuenteOficial,
    identificador: certificacion.identificadorDocumento,
    vigenteHasta: certificacion.vigenteHasta,
    estado: certificacion.estado,
    motivoRechazo: certificacion.motivoRechazo,
    enviadaEn: certificacion.creadoEn,
    revisadaEn: certificacion.fechaConsulta,
  };
}

/** El catálogo del formulario. */
export async function catalogo() {
  return (await tiposCertificables()).map(({ codigo, nombre, fuenteOficial, requiereVigencia }) => ({
    codigo,
    nombre,
    emisor: fuenteOficial,
    requiereVigencia,
  }));
}

/**
 * Envío de una certificación. Orden pensado para no guardar nada que
 * después haya que rechazar (igual que la cédula):
 * 1. Perfil, tipo del catálogo, campos y archivo, sin tocar la red.
 * 2. Revisión previa de pendiente duplicada y del límite diario.
 * 3. Recién entonces se sube el archivo, con un id generado acá.
 * 4. Una transacción con bloqueo vuelve a revisar y crea la certificación.
 *    Si entre medio llegó otro envío, se borra el archivo recién subido.
 */
export async function enviar(usuarioId: string, datos: DatosCertificacion, contenido: Buffer) {
  const perfil = await buscarPerfilDelUsuario(usuarioId);
  if (!perfil) {
    throw new ErrorHttp(409, "PERFIL_REQUERIDO", "Completa tu perfil de prestador antes de subir certificaciones.");
  }

  const tipo = (await tiposCertificables()).find((candidato) => candidato.codigo === datos.tipo);
  if (!tipo) throw errorCampo("tipo", "Elige un tipo de certificación de la lista.");
  if (tipo.requiereVigencia && !datos.vigenteHasta) {
    throw errorCampo("vigenteHasta", "Esta certificación vence: indica hasta cuándo está vigente.");
  }

  const tipoArchivo = detectarTipo(contenido);
  if (!tipoArchivo) throw errorCampo("documento", "El documento debe ser una imagen JPG o PNG, o un PDF.");

  let limpio: Buffer;
  try {
    limpio = quitarMetadatos(contenido, tipoArchivo);
  } catch (error) {
    if (error instanceof DocumentoMalFormado) {
      throw errorCampo("documento", "El archivo parece dañado. Vuelve a exportarlo o toma una foto nueva.");
    }
    throw error;
  }

  const clave = {
    prestadorId: perfil.id,
    tipoId: tipo.id,
    // Solo OTRA tiene nombre propio (el esquema lo descarta en el resto).
    nombre: tipo.codigo === CODIGO_CERTIFICACION_OTRA ? datos.nombre : null,
    limite: { maximo: MAXIMO_CERTIFICACIONES_POR_DIA, desde: new Date(Date.now() - VENTANA_MS) },
  };
  const previa = await revisarEnvio(clave);
  if (previa !== "permitido") throw errorDeEnvio(previa);

  const id = randomUUID();
  const almacenamiento = obtenerAlmacenamientoCertificaciones();
  await almacenamiento.guardar({ id, contenido: limpio, tipo: tipoArchivo });

  try {
    const { resultado, certificacion } = await registrarEnvio({
      ...clave,
      id,
      identificador: datos.identificador,
      vigenteHasta: datos.vigenteHasta,
      emisor: clave.nombre === null ? null : datos.emisor,
      autorId: usuarioId,
    });
    if (!certificacion) {
      await almacenamiento.eliminar(id);
      throw errorDeEnvio(resultado);
    }
    return vista(certificacion);
  } catch (error) {
    // Fallo de la base: el archivo no puede quedar sin certificación que lo explique.
    if (!(error instanceof ErrorHttp)) await almacenamiento.eliminar(id);
    throw error;
  }
}

export async function propias(usuarioId: string) {
  const perfil = await buscarPerfilDelUsuario(usuarioId);
  if (!perfil) return [];
  return (await certificacionesDe(perfil.id)).map(vista);
}

// ─── Administración ────────────────────────────────────────────────────────

export async function cola(estado: EstadoCredencial, pagina: number, porPagina: number) {
  const { certificaciones, total } = await colaCertificaciones(estado, pagina, porPagina);
  return {
    certificaciones: certificaciones.map((certificacion) => ({
      ...vista(certificacion),
      prestador: { id: certificacion.prestador.id, nombre: certificacion.prestador.usuario.nombre, rut: certificacion.prestador.usuario.rut },
    })),
    pagina,
    porPagina,
    total,
  };
}

function noEncontrada(): ErrorHttp {
  return new ErrorHttp(404, "CERTIFICACION_NO_ENCONTRADA", "No existe esa certificación.");
}

function documentoNoDisponible(): ErrorHttp {
  return new ErrorHttp(410, "DOCUMENTO_NO_DISPONIBLE", "El documento ya no está disponible: se elimina al terminar la revisión.");
}

/**
 * URL firmada para que un administrador vea el documento. El acceso se
 * registra ANTES de generar la URL, y la URL no se guarda ni se registra en
 * ningún log: se devuelve una vez y vence a los 5 minutos.
 */
export async function urlDocumento(id: string, administradorId: string) {
  const certificacion = await buscarCertificacion(id);
  if (!certificacion) throw noEncontrada();
  if (certificacion.estado !== "PENDIENTE") throw documentoNoDisponible();

  await registrarAccesoDocumento(id, administradorId);

  try {
    const url = await obtenerAlmacenamientoCertificaciones().urlFirmada(id, DURACION_URL_SEGUNDOS);
    return { url, expiraEn: new Date(Date.now() + DURACION_URL_SEGUNDOS * 1000) };
  } catch (error) {
    if (error instanceof DocumentoNoEncontrado) throw documentoNoDisponible();
    throw error;
  }
}

async function resolver(id: string, decision: DecisionCertificacion) {
  const almacenamiento = obtenerAlmacenamientoCertificaciones();

  let certificacion;
  try {
    certificacion = await resolverCertificacion(id, decision, () => almacenamiento.eliminar(id));
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    // Solo el id: ni la respuesta del proveedor ni URLs.
    console.error("No se pudo resolver la certificación", { id, estado: decision.estado }, error instanceof Error ? error.name : "");
    throw new ErrorHttp(
      503,
      "ALMACENAMIENTO_NO_DISPONIBLE",
      "No se pudo eliminar el documento. La certificación sigue pendiente; intenta de nuevo.",
    );
  }

  if (!certificacion) {
    throw (await buscarCertificacion(id))
      ? new ErrorHttp(409, "CERTIFICACION_YA_REVISADA", "Esta certificación ya fue revisada.")
      : noEncontrada();
  }
  return vista(certificacion);
}

export async function aprobar(id: string, administradorId: string) {
  return resolver(id, { estado: "VERIFICADA", administradorId });
}

export async function rechazar(id: string, administradorId: string, motivo: string) {
  return resolver(id, { estado: "RECHAZADA", administradorId, motivo });
}
