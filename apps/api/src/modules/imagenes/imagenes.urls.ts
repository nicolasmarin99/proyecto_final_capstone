import type { EstadoImagen } from "../../generated/prisma/client.js";
import { obtenerAlmacenamientoPublico } from "../almacenamiento/index.js";
import { motivosDe } from "./imagenes.repository.js";

/*
  Cómo sale una imagen en las respuestas. Está aparte del servicio de
  imágenes porque también lo usan la página pública y la búsqueda (módulo
  servicios), y así ninguno de los dos servicios depende del otro en ciclo.
*/

/** Imagen tal como la ve el público: solo direcciones, nunca el identificador interno. */
export function imagenPublica(id: string, identificador: string) {
  const almacenamiento = obtenerAlmacenamientoPublico();
  return { id, url: almacenamiento.url(identificador, "completa"), miniatura: almacenamiento.url(identificador, "miniatura") };
}

export function urlMiniatura(identificador: string): string {
  return obtenerAlmacenamientoPublico().url(identificador, "miniatura");
}

interface FilaImagen {
  id: string;
  identificador: string;
  orden: number;
  estado: EstadoImagen;
}

/**
 * Imagen tal como la ve su dueño (o el administrador): con su posición, su
 * estado y, si se ocultó, el motivo (que viene de la bitácora).
 *
 * Una imagen OCULTA ya no tiene archivo (se borró del proveedor al
 * ocultarla), así que sus direcciones son null: la interfaz muestra un
 * marcador con el motivo en vez de intentar cargarla.
 */
export function imagenPropia(fila: FilaImagen, motivo: string | null) {
  const direcciones =
    fila.estado === "OCULTA" ? { id: fila.id, url: null, miniatura: null } : imagenPublica(fila.id, fila.identificador);
  return {
    ...direcciones,
    orden: fila.orden,
    estado: fila.estado,
    motivoOcultamiento: fila.estado === "OCULTA" ? motivo : null,
  };
}

/** Varias imágenes propias, con el motivo de las ocultas leído de la bitácora en una sola consulta. */
export async function imagenesPropias(filas: FilaImagen[]) {
  const motivos = await motivosDe(filas.filter((fila) => fila.estado === "OCULTA").map((fila) => fila.id));
  return filas.map((fila) => imagenPropia(fila, motivos.get(fila.id)?.motivo ?? null));
}
