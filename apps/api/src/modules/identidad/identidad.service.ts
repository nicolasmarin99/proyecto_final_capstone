import { randomUUID } from "node:crypto";
import type { EstadoCredencial } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import { DocumentoNoEncontrado, obtenerAlmacenamiento } from "../almacenamiento/index.js";
import { DocumentoMalFormado, detectarTipo, quitarMetadatos } from "./identidad.documento.js";
import {
  buscarIdentidad,
  buscarPerfilDelUsuario,
  buscarTipoIdentidad,
  buscarUltimaIdentidad,
  contarCargasDesde,
  listarIdentidades,
  registrarAccesoDocumento,
  registrarCarga,
  resolverIdentidad,
  revisarCarga,
  type DecisionIdentidad,
  type ResultadoRevisionCarga,
} from "./identidad.repository.js";

/** Cargas permitidas por cuenta en la ventana móvil de 24 horas. */
export const MAXIMO_CARGAS_24H = 3;
const VENTANA_MS = 24 * 60 * 60 * 1000;

/** Vigencia de la URL firmada que ve el administrador. */
const DURACION_URL_SEGUNDOS = 5 * 60;

const MENSAJE_TIPO = "Sube una foto JPG o PNG, o un PDF, de tu cédula de identidad.";

function errorDocumento(mensaje: string) {
  return new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
    { campo: "documento", mensaje },
  ]);
}

/** Traduce el resultado de la revisión de una carga al error que ve el prestador. */
function errorDeCarga(resultado: Exclude<ResultadoRevisionCarga, "permitida">): ErrorHttp {
  switch (resultado) {
    case "pendiente":
      return new ErrorHttp(
        409,
        "VERIFICACION_PENDIENTE",
        "Ya tienes un documento en revisión. Te avisaremos cuando un administrador lo revise.",
      );
    case "verificada":
      return new ErrorHttp(409, "IDENTIDAD_YA_VERIFICADA", "Tu identidad ya está verificada.");
    case "limite":
      return new ErrorHttp(
        429,
        "DEMASIADAS_CARGAS",
        `Puedes subir tu documento hasta ${MAXIMO_CARGAS_24H} veces en 24 horas. Intenta más tarde.`,
      );
  }
}

function inicioVentana(): Date {
  return new Date(Date.now() - VENTANA_MS);
}

/**
 * Carga del documento de identidad del prestador.
 *
 * Orden pensado para no guardar nada que después haya que rechazar:
 * 1. Perfil, tipo real y metadatos, sin tocar la red.
 * 2. Revisión previa de pendiente / verificada / límite.
 * 3. Recién entonces se sube el archivo, con un id generado acá.
 * 4. Una transacción con bloqueo vuelve a revisar y crea la credencial. Si
 *    entre medio llegó otra carga, se borra el archivo recién subido: no
 *    puede quedar un documento sin credencial que lo explique.
 */
export async function cargarDocumento(usuarioId: string, contenido: Buffer) {
  const perfil = await buscarPerfilDelUsuario(usuarioId);

  if (!perfil) {
    throw new ErrorHttp(
      409,
      "PERFIL_REQUERIDO",
      "Completa tu perfil de prestador antes de verificar tu identidad.",
    );
  }

  const tipoArchivo = detectarTipo(contenido);

  if (!tipoArchivo) {
    throw errorDocumento(MENSAJE_TIPO);
  }

  let limpio: Buffer;
  try {
    limpio = quitarMetadatos(contenido, tipoArchivo);
  } catch (error) {
    if (error instanceof DocumentoMalFormado) {
      throw errorDocumento("El archivo parece dañado. Vuelve a exportarlo o toma una foto nueva.");
    }
    throw error;
  }

  const tipoCredencial = await buscarTipoIdentidad();

  if (!tipoCredencial) {
    // Falta correr seed:maestros: es un problema de despliegue, no del usuario.
    throw new Error("No existe el tipo de credencial IDENTIDAD. Ejecuta npm run seed:maestros.");
  }

  const limite = { maximo: MAXIMO_CARGAS_24H, desde: inicioVentana() };
  const previa = await revisarCarga(perfil.id, limite);

  if (previa !== "permitida") {
    throw errorDeCarga(previa);
  }

  // El nombre del archivo en el almacenamiento es el id de la credencial. El
  // nombre original (que suele traer el nombre de la persona) se descarta.
  const id = randomUUID();
  const almacenamiento = obtenerAlmacenamiento();
  await almacenamiento.guardar({ id, contenido: limpio, tipo: tipoArchivo });

  try {
    const { resultado, credencial } = await registrarCarga({
      id,
      prestadorId: perfil.id,
      tipoId: tipoCredencial.id,
      // Lo que identifica al titular ya es el RUT de la cuenta: no se guarda
      // ningún dato nuevo leído del documento (número de serie, vencimiento).
      identificadorDocumento: perfil.usuario.rut ?? "no informado",
      autorId: usuarioId,
      limite,
    });

    if (!credencial) {
      await almacenamiento.eliminar(id);
      throw errorDeCarga(resultado);
    }

    return credencial;
  } catch (error) {
    if (!(error instanceof ErrorHttp)) {
      // Fallo de la base: el archivo no puede quedar sin credencial.
      await almacenamiento.eliminar(id);
    }
    throw error;
  }
}

/** Estado propio. Nunca incluye nada que permita llegar al archivo. */
export async function obtenerEstadoPropio(usuarioId: string) {
  const perfil = await buscarPerfilDelUsuario(usuarioId);

  if (!perfil) {
    return { identidad: null, cargasDisponibles: MAXIMO_CARGAS_24H };
  }

  const [identidad, recientes] = await Promise.all([
    buscarUltimaIdentidad(perfil.id),
    contarCargasDesde(perfil.id, inicioVentana()),
  ]);

  return {
    identidad: identidad && {
      estado: identidad.estado,
      // Solo un rechazo tiene motivo; se manda únicamente en ese caso.
      motivoRechazo: identidad.estado === "RECHAZADA" ? identidad.motivoRechazo : null,
      enviadaEn: identidad.creadoEn,
      revisadaEn: identidad.fechaConsulta,
    },
    cargasDisponibles: Math.max(0, MAXIMO_CARGAS_24H - recientes),
  };
}

export async function obtenerCola(estado: EstadoCredencial, pagina: number, porPagina: number) {
  const { filas, total } = await listarIdentidades(estado, (pagina - 1) * porPagina, porPagina);

  return {
    identidades: filas.map((fila) => ({
      id: fila.id,
      estado: fila.estado,
      motivoRechazo: fila.motivoRechazo,
      enviadaEn: fila.creadoEn,
      revisadaEn: fila.fechaConsulta,
      prestador: {
        nombre: fila.prestador.usuario.nombre,
        rut: fila.prestador.usuario.rut,
        comuna: fila.prestador.comuna.nombre,
      },
    })),
    pagina,
    porPagina,
    total,
  };
}

function noEncontrada() {
  return new ErrorHttp(404, "IDENTIDAD_NO_ENCONTRADA", "No existe esa solicitud de verificación.");
}

function documentoNoDisponible() {
  return new ErrorHttp(
    409,
    "DOCUMENTO_NO_DISPONIBLE",
    "El documento ya no está disponible: se elimina al terminar la revisión.",
  );
}

/**
 * URL firmada para que un administrador vea el documento.
 *
 * El acceso se registra ANTES de generar la URL: si el registro fallara, la
 * URL nunca llega a existir. Al revés podría quedar un acceso sin rastro.
 *
 * La URL no se registra en ningún log ni se guarda en la base: se devuelve
 * una sola vez, y vence a los 5 minutos.
 */
export async function obtenerUrlDocumento(id: string, administradorId: string) {
  const identidad = await buscarIdentidad(id);

  if (!identidad) throw noEncontrada();
  // Solo las pendientes conservan su archivo: las revisadas ya lo borraron.
  if (identidad.estado !== "PENDIENTE") throw documentoNoDisponible();

  await registrarAccesoDocumento(id, administradorId);

  try {
    const url = await obtenerAlmacenamiento().urlFirmada(id, DURACION_URL_SEGUNDOS);
    return { url, expiraEn: new Date(Date.now() + DURACION_URL_SEGUNDOS * 1000) };
  } catch (error) {
    // Pasa con el almacenamiento en memoria si la API se reinició: la
    // credencial sigue pendiente pero su archivo se perdió.
    if (error instanceof DocumentoNoEncontrado) throw documentoNoDisponible();
    throw error;
  }
}

async function resolver(id: string, decision: DecisionIdentidad) {
  const almacenamiento = obtenerAlmacenamiento();

  let credencial;
  try {
    credencial = await resolverIdentidad(id, decision, () => almacenamiento.eliminar(id));
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    // Solo el id: ni la respuesta del proveedor ni URLs.
    console.error("No se pudo resolver la identidad", { id, estado: decision.estado }, error);
    throw new ErrorHttp(
      503,
      "ALMACENAMIENTO_NO_DISPONIBLE",
      "No se pudo eliminar el documento. La solicitud sigue pendiente; intenta de nuevo.",
    );
  }

  if (!credencial) {
    // No cambió ninguna fila: o no existe, o ya no estaba pendiente.
    throw (await buscarIdentidad(id))
      ? new ErrorHttp(409, "IDENTIDAD_YA_REVISADA", "Esta solicitud ya fue revisada.")
      : noEncontrada();
  }

  return {
    id: credencial.id,
    estado: credencial.estado,
    motivoRechazo: credencial.motivoRechazo,
    revisadaEn: credencial.fechaConsulta,
  };
}

export async function aprobarIdentidad(id: string, administradorId: string) {
  return resolver(id, { estado: "VERIFICADA", administradorId });
}

export async function rechazarIdentidad(id: string, administradorId: string, motivo: string) {
  return resolver(id, { estado: "RECHAZADA", administradorId, motivo });
}
