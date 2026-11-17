import { randomUUID } from "node:crypto";
import { MAXIMO_FOTOS_PERFIL_POR_DIA, MAXIMO_REPORTES_POR_DIA } from "@localcl/shared";
import { ErrorHttp } from "../../shared/errores.js";
import { obtenerAlmacenamientoPerfiles } from "../almacenamiento/index.js";
import { detectarTipoImagen, ImagenMalFormada, quitarMetadatosImagen } from "../imagenes/imagenes.archivo.js";
import {
  buscarFotoReportable,
  contarFotosRecientes,
  crearReporteFoto,
  fotosReportadas,
  quitarFotoVigente,
  registrarDecisionFoto,
  registrarFotoNueva,
  ultimaFotoDe,
} from "./fotos-perfil.repository.js";
import type { DatosReporteFoto, ListadoFotos } from "./fotos-perfil.schema.js";
import { fotoPublica } from "./fotos-perfil.urls.js";

/*
  Fotos de perfil de cualquier cuenta. Se publican al subirlas: no hay
  revisión previa. La moderación parte de un reporte, y un administrador
  puede retirar una foto reportada (con motivo, en la bitácora). Nada en
  este archivo retira una foto por cantidad de reportes: como con los
  servicios, un umbral automático sería manipulable.
*/

const UNA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

function imagenInvalida(mensaje: string): ErrorHttp {
  return new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [{ campo: "imagen", mensaje }]);
}

function limiteFotos(): ErrorHttp {
  return new ErrorHttp(
    429,
    "DEMASIADAS_FOTOS",
    `Puedes cambiar tu foto hasta ${MAXIMO_FOTOS_PERFIL_POR_DIA} veces en 24 horas. Inténtalo más tarde.`,
  );
}

function proveedorNoDisponible(): ErrorHttp {
  return new ErrorHttp(
    502,
    "ALMACENAMIENTO_NO_DISPONIBLE",
    "No se pudo guardar el cambio de la foto en este momento. Intenta de nuevo en unos minutos.",
  );
}

/** Solo el tipo de error: la respuesta del proveedor podría traer datos de la cuenta. */
function registrarFalloProveedor(accion: string, error: unknown) {
  console.error(`Foto de perfil: el proveedor falló al ${accion}.`, error instanceof Error ? error.name : "");
}

// ─── La cuenta y su foto ───────────────────────────────────────────────────

/**
 * La foto de la propia cuenta y, si la última que tuvo la retiró un
 * administrador, el aviso con el motivo. El aviso deja de salir en cuanto
 * sube otra.
 */
export async function miFoto(usuarioId: string) {
  const ultima = await ultimaFotoDe(usuarioId);

  return {
    foto: ultima?.estado === "VIGENTE" ? fotoPublica([ultima]) : null,
    retirada:
      ultima?.estado === "RETIRADA" && ultima.finEn
        ? { motivo: ultima.decisiones[0]?.motivo ?? null, retiradaEn: ultima.finEn }
        : null,
  };
}

/**
 * Sube (o cambia) la foto de perfil. Los mismos pasos que una foto de un
 * servicio:
 * 1. el formato se decide por los bytes, nunca por el nombre ni el
 *    Content-Type;
 * 2. se quitan los metadatos (EXIF, GPS): una selfie trae dónde se tomó;
 * 3. el nombre lo genera el servidor;
 * 4. se sube al proveedor y se registra en la base. Si la base no la acepta
 *    (límite, o un fallo al borrar la anterior), se borra la nueva del
 *    proveedor: no quedan archivos huérfanos.
 */
export async function subirFoto(usuarioId: string, contenido: Buffer) {
  const tipo = detectarTipoImagen(contenido);
  if (!tipo) throw imagenInvalida("La foto debe ser una imagen JPG, PNG o WEBP.");

  let limpia: Buffer;
  try {
    limpia = quitarMetadatosImagen(contenido, tipo);
  } catch (error) {
    if (error instanceof ImagenMalFormada) throw imagenInvalida("La imagen está dañada o no se pudo leer. Prueba con otra.");
    throw error;
  }

  // Revisión temprana, sin bloqueo: evita subir algo que se va a rechazar.
  // La que vale es la de registrarFotoNueva.
  if ((await contarFotosRecientes(usuarioId)) >= MAXIMO_FOTOS_PERFIL_POR_DIA) throw limiteFotos();

  const almacenamiento = obtenerAlmacenamientoPerfiles();
  const identificador = randomUUID();
  await almacenamiento.guardar({ id: identificador, contenido: limpia, tipo });

  let resultado;
  const borrado = borradoVigilado();
  try {
    resultado = await registrarFotoNueva(usuarioId, identificador, MAXIMO_FOTOS_PERFIL_POR_DIA, borrado.borrar);
  } catch (error) {
    await almacenamiento.eliminar(identificador);
    if (borrado.fallo()) {
      registrarFalloProveedor("borrar la foto anterior", error);
      throw proveedorNoDisponible();
    }
    throw error;
  }

  if (resultado.resultado === "limite") {
    await almacenamiento.eliminar(identificador);
    throw limiteFotos();
  }

  return fotoPublica([resultado.foto]);
}

/**
 * Envuelve el borrado en el proveedor para saber, si la transacción falla,
 * si fue por él (502: reintentable) o por otra cosa (que sigue su curso).
 */
function borradoVigilado() {
  const estado = { fallo: false };
  const borrar = async (identificador: string) => {
    try {
      await obtenerAlmacenamientoPerfiles().eliminar(identificador);
    } catch (error) {
      estado.fallo = true;
      throw error;
    }
  };
  return { borrar, fallo: () => estado.fallo };
}

/** Quita la foto vigente. Idempotente: sin foto, no hay nada que hacer. */
export async function quitarFoto(usuarioId: string) {
  const borrado = borradoVigilado();
  try {
    await quitarFotoVigente(usuarioId, borrado.borrar);
  } catch (error) {
    if (!borrado.fallo()) throw error;
    registrarFalloProveedor("quitar la foto", error);
    throw proveedorNoDisponible();
  }
}

// ─── Reportes ──────────────────────────────────────────────────────────────

const RESPUESTA_REPORTE = { mensaje: "Gracias. Revisaremos esta foto." } as const;

/**
 * Reporta una foto de perfil. Reglas, en este orden:
 * 1. la foto debe estar vigente (404 si no: para el público no existe);
 * 2. nadie reporta su propia foto (403);
 * 3. a lo más MAXIMO_REPORTES_POR_DIA reportes en 24 horas, contando todo
 *    lo que la persona reportó (429);
 * 4. uno abierto por persona y foto.
 *
 * Responde LO MISMO se haya creado o ya existiera.
 */
export async function reportarFoto(usuarioId: string, fotoId: string, datos: DatosReporteFoto) {
  const foto = await buscarFotoReportable(fotoId);
  if (!foto || foto.estado !== "VIGENTE") {
    throw new ErrorHttp(404, "FOTO_NO_ENCONTRADA", "Esa foto no existe.");
  }
  if (foto.usuarioId === usuarioId) {
    throw new ErrorHttp(403, "REPORTE_NO_PERMITIDO", "No puedes reportar tu propia foto.");
  }

  const resultado = await crearReporteFoto(
    { denuncianteId: usuarioId, fotoPerfilId: fotoId, motivo: datos.motivo, comentario: datos.comentario },
    MAXIMO_REPORTES_POR_DIA,
  );
  if (resultado === "limite") {
    throw new ErrorHttp(
      429,
      "DEMASIADOS_REPORTES",
      `Puedes enviar hasta ${MAXIMO_REPORTES_POR_DIA} reportes en 24 horas. Inténtalo más tarde.`,
    );
  }

  return RESPUESTA_REPORTE;
}

// ─── Administración ────────────────────────────────────────────────────────

/**
 * Las fotos reportadas que esperan una decisión: lo ÚNICO que el panel
 * muestra de las fotos de perfil. De quien reportó solo sale si su cuenta
 * tenía más de una semana; nunca quién es.
 */
export async function listarReportadas(filtros: ListadoFotos) {
  const { fotos, total } = await fotosReportadas(filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina);

  return {
    fotos: fotos.map((foto) => ({
      ...fotoPublica([foto]),
      subidaEn: foto.creadoEn,
      cuenta: { nombre: foto.usuario.nombre, rol: foto.usuario.rol },
      retiradasAntes: foto.retiradasAntes,
      personas: new Set(foto.denuncias.map((denuncia) => denuncia.denuncianteId)).size,
      reportes: foto.denuncias.map((denuncia) => ({
        id: denuncia.id,
        motivo: denuncia.motivo,
        comentario: denuncia.detalle,
        enviadoEn: denuncia.creadoEn,
        cuentaConMasDeUnaSemana: denuncia.creadoEn.getTime() - denuncia.denunciante.creadoEn.getTime() > UNA_SEMANA_MS,
      })),
    })),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    total,
  };
}

/**
 * Retira la foto (borra su archivo) o desestima sus reportes. Siempre un
 * administrador, siempre con motivo, siempre en la bitácora. El motivo de
 * un retiro lo ve el dueño de la cuenta.
 */
export async function decidirFoto(
  fotoId: string,
  administradorId: string,
  accion: "DESESTIMAR" | "RETIRAR_FOTO_PERFIL",
  motivo: string,
) {
  let resultado;
  const borrado = borradoVigilado();
  try {
    resultado = await registrarDecisionFoto({ fotoPerfilId: fotoId, administradorId, accion, motivo }, borrado.borrar);
  } catch (error) {
    if (!borrado.fallo()) throw error;
    registrarFalloProveedor("retirar una foto reportada", error);
    throw new ErrorHttp(
      502,
      "ALMACENAMIENTO_NO_DISPONIBLE",
      "No se pudo borrar el archivo de la foto, así que no se retiró. Sigue visible; intenta de nuevo en un momento.",
    );
  }

  if (resultado === "sin_foto") throw new ErrorHttp(404, "FOTO_NO_ENCONTRADA", "Esa foto no existe.");
  if (resultado === "no_vigente") {
    throw new ErrorHttp(409, "FOTO_NO_VIGENTE", "Esa foto ya no se muestra: su dueño la cambió o ya se retiró.");
  }
  if (resultado === "sin_pendientes") {
    throw new ErrorHttp(409, "SIN_REPORTES_PENDIENTES", "Esta foto no tiene reportes pendientes que desestimar.");
  }

  return { foto: { id: fotoId, estado: accion === "RETIRAR_FOTO_PERFIL" ? "RETIRADA" : "VIGENTE" }, accion, motivo };
}
