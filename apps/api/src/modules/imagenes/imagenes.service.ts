import { randomUUID } from "node:crypto";
import { MAXIMO_IMAGENES_SERVICIO } from "@localcl/shared";
import { ErrorHttp } from "../../shared/errores.js";
import { obtenerAlmacenamientoPublico } from "../almacenamiento/index.js";
import { exigirDueno } from "../servicios/servicios.service.js";
import { detectarTipoImagen, ImagenMalFormada, quitarMetadatosImagen } from "./imagenes.archivo.js";
import { imagenesPropias, imagenPropia } from "./imagenes.urls.js";
import {
  buscarImagen,
  contarImagenes,
  crearImagenConCupo,
  eliminarImagenYCompactar,
  listarImagenesDe,
  listarImagenesParaModerar,
  motivosDe,
  ocultarImagen,
  reordenarImagenes,
} from "./imagenes.repository.js";
import type { ListadoAdmin } from "./imagenes.schema.js";

function limiteAlcanzado(): ErrorHttp {
  return new ErrorHttp(409, "LIMITE_IMAGENES", `Un servicio puede tener hasta ${MAXIMO_IMAGENES_SERVICIO} imágenes. Elimina una para subir otra.`);
}

function imagenInvalida(mensaje: string): ErrorHttp {
  return new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [{ campo: "imagen", mensaje }]);
}

// ─── Prestador ─────────────────────────────────────────────────────────────

/**
 * Sube una foto a un servicio propio.
 *
 * 1. El formato se decide por los bytes; el nombre y el Content-Type del
 *    cliente no se miran.
 * 2. Se quitan los metadatos (EXIF, GPS) antes de que el archivo salga del
 *    servidor.
 * 3. El nombre lo genera el servidor (uuid).
 * 4. Se sube al proveedor y después se registra en la base con el cupo
 *    revisado bajo bloqueo. Si la base no la acepta (cupo lleno por una
 *    subida simultánea, o un fallo), el archivo se borra del proveedor: no
 *    quedan archivos huérfanos ni filas sin archivo.
 */
export async function subirImagen(usuarioId: string, servicioId: string, contenido: Buffer) {
  await exigirDueno(usuarioId, servicioId);

  const tipo = detectarTipoImagen(contenido);
  if (!tipo) {
    throw imagenInvalida("El archivo debe ser una imagen JPG, PNG o WEBP.");
  }

  let limpia: Buffer;
  try {
    limpia = quitarMetadatosImagen(contenido, tipo);
  } catch (error) {
    if (error instanceof ImagenMalFormada) {
      throw imagenInvalida("La imagen está dañada o no se pudo leer. Prueba con otra.");
    }
    throw error;
  }

  // Revisión temprana, sin bloqueo: evita subir al proveedor algo que se
  // va a rechazar. La que vale es la de crearImagenConCupo.
  if ((await contarImagenes(servicioId)) >= MAXIMO_IMAGENES_SERVICIO) {
    throw limiteAlcanzado();
  }

  const almacenamiento = obtenerAlmacenamientoPublico();
  const identificador = randomUUID();
  await almacenamiento.guardar({ id: identificador, contenido: limpia, tipo });

  let fila;
  try {
    fila = await crearImagenConCupo(servicioId, identificador, MAXIMO_IMAGENES_SERVICIO);
  } catch (error) {
    await almacenamiento.eliminar(identificador);
    throw error;
  }

  if (!fila) {
    await almacenamiento.eliminar(identificador);
    throw limiteAlcanzado();
  }

  return imagenPropia(fila, null);
}

/** Una imagen de este servicio, o 404. Que exista en otro servicio no cuenta. */
async function imagenDelServicio(servicioId: string, imagenId: string) {
  const imagen = await buscarImagen(imagenId);

  if (!imagen || imagen.servicioId !== servicioId) {
    throw new ErrorHttp(404, "IMAGEN_NO_ENCONTRADA", "Esa imagen no existe.");
  }

  return imagen;
}

/**
 * Borra el archivo del proveedor y después la fila. En ese orden: si el
 * proveedor falla, la fila sigue ahí y se puede reintentar; al revés
 * quedaría un archivo público que nadie sabe que existe.
 *
 * Una imagen oculta también se puede borrar: su archivo ya no existe y la
 * evidencia de la moderación vive en la bitácora, no en esta fila.
 */
export async function eliminarImagen(usuarioId: string, servicioId: string, imagenId: string) {
  await exigirDueno(usuarioId, servicioId);
  const imagen = await imagenDelServicio(servicioId, imagenId);

  if (imagen.estado === "VISIBLE") {
    await obtenerAlmacenamientoPublico().eliminar(imagen.identificador);
  }
  await eliminarImagenYCompactar(servicioId, imagenId);
}

/**
 * El orden nuevo debe nombrar exactamente las imágenes VISIBLES del
 * servicio: ni una más, ni una menos. Las ocultas por moderación no se
 * muestran ni se reordenan: quedan al final, en el orden que tenían.
 */
export async function ordenarImagenes(usuarioId: string, servicioId: string, ids: string[]) {
  await exigirDueno(usuarioId, servicioId);
  const actuales = await listarImagenesDe(servicioId);
  const visibles = new Set(actuales.filter((imagen) => imagen.estado === "VISIBLE").map((imagen) => imagen.id));
  const ocultas = actuales.filter((imagen) => imagen.estado === "OCULTA").map((imagen) => imagen.id);

  if (ids.length !== visibles.size || ids.some((id) => !visibles.has(id))) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "imagenes", mensaje: "El orden debe incluir cada imagen visible del servicio exactamente una vez." },
    ]);
  }

  await reordenarImagenes(servicioId, [...ids, ...ocultas]);
  return imagenesPropias(await listarImagenesDe(servicioId));
}

export async function imagenesDe(servicioId: string) {
  return imagenesPropias(await listarImagenesDe(servicioId));
}

// ─── Administración ────────────────────────────────────────────────────────

/**
 * Oculta una imagen por moderación y borra su archivo del proveedor: una
 * foto inapropiada tiene que dejar de existir en internet, no solo en
 * LocalCL, porque su URL pública pudo quedar guardada en cualquier parte.
 *
 * La moderación queda en la bitácora (moderaciones_imagen) con el motivo, el
 * administrador y la fecha: es la evidencia, y sobrevive a que el prestador
 * borre la imagen o el servicio. Es irreversible: sin archivo no hay nada
 * que volver a mostrar; el prestador tendría que subir la foto de nuevo.
 *
 * Si el proveedor no confirma el borrado, se revierte todo (ver
 * ocultarImagen) y se responde 502: la imagen sigue visible y el
 * administrador puede reintentar. Nunca queda «oculta» con el archivo vivo.
 */
export async function ocultar(imagenId: string, administradorId: string, motivo: string) {
  const imagen = await buscarImagen(imagenId);

  if (!imagen) {
    throw new ErrorHttp(404, "IMAGEN_NO_ENCONTRADA", "Esa imagen no existe.");
  }

  let ocultadas: number;
  try {
    ocultadas = await ocultarImagen(imagen, administradorId, motivo, () =>
      obtenerAlmacenamientoPublico().eliminar(imagen.identificador),
    );
  } catch (error) {
    // Solo el id de la imagen y el tipo de error: la respuesta del proveedor
    // podría traer datos de la cuenta.
    console.error(
      `No se pudo borrar del proveedor la imagen ${imagenId} al ocultarla; no se ocultó.`,
      error instanceof Error ? error.name : "",
    );
    throw new ErrorHttp(
      502,
      "ALMACENAMIENTO_NO_DISPONIBLE",
      "No se pudo borrar el archivo de la imagen, así que no se ocultó. Sigue visible; intenta de nuevo en un momento.",
    );
  }

  if (ocultadas === 0) {
    throw new ErrorHttp(409, "IMAGEN_YA_OCULTA", "Esa imagen ya estaba oculta.");
  }

  const actualizada = await buscarImagen(imagenId);
  if (!actualizada) {
    throw new ErrorHttp(404, "IMAGEN_NO_ENCONTRADA", "Esa imagen no existe.");
  }
  return imagenPropia(actualizada, motivo);
}

export async function listarParaModerar(filtros: ListadoAdmin) {
  const { imagenes, total } = await listarImagenesParaModerar({
    estado: filtros.estado,
    servicioId: filtros.servicio,
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
  });

  const moderaciones = await motivosDe(imagenes.filter((imagen) => imagen.estado === "OCULTA").map((imagen) => imagen.id));

  return {
    imagenes: imagenes.map((imagen) => ({
      ...imagenPropia(imagen, moderaciones.get(imagen.id)?.motivo ?? null),
      subidaEn: imagen.creadoEn,
      ocultadaEn: moderaciones.get(imagen.id)?.creadoEn ?? null,
      ocultadaPor: moderaciones.get(imagen.id)?.administrador ?? null,
      servicio: {
        id: imagen.servicio.id,
        titulo: imagen.servicio.titulo,
        estado: imagen.servicio.estado,
        prestador: imagen.servicio.prestador.usuario.nombre,
      },
    })),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    total,
  };
}
