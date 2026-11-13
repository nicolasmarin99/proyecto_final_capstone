import { createHash } from "node:crypto";
import { obtenerProveedorEmbeddings, type ProveedorEmbeddings } from "../embeddings/index.js";
import { guardarEmbedding, paginaParaIndexar, serviciosParaIndexar, type FilaIndexacion } from "./servicios.repository.js";

/*
  Indexación semántica de servicios: calcula y guarda el vector de cada uno.

  Se llama al crear y al editar un servicio (servicios.service.ts) y desde
  el script de regeneración (src/scripts/regenerarEmbeddings.ts). Al buscar
  no se pasa por acá: solo se vectoriza la consulta.
*/

/** Servicios por llamada al proveedor. */
export const TAMANO_LOTE_EMBEDDINGS = 100;

/**
 * ÚNICA definición del texto que representa a un servicio para la búsqueda
 * semántica: título + descripción + nombre de la categoría.
 *
 * Con «Otros» el nombre de la categoría es el oficio que escribió el
 * prestador («Pintura de interiores»): es el que se muestra al público, y
 * «Otros» no dice nada del significado.
 *
 * Si esta composición cambia, cambia el hash de todos los servicios y el
 * script de regeneración los vuelve a vectorizar: no hay que migrar nada.
 */
export function textoParaEmbedding(servicio: {
  titulo: string;
  descripcion: string;
  categoriaNombre: string;
  categoriaPersonalizada: string | null;
}): string {
  return [servicio.titulo, servicio.descripcion, `Categoría: ${servicio.categoriaPersonalizada ?? servicio.categoriaNombre}`].join("\n");
}

/**
 * Hash del texto fuente Y del proveedor que lo vectoriza. Así un servicio
 * queda «desactualizado» tanto si cambió su texto como si cambió el modelo:
 * mezclar vectores de dos modelos daría distancias sin sentido.
 */
export function hashTexto(texto: string, proveedor: ProveedorEmbeddings): string {
  return createHash("sha256").update(`${proveedor.identificador}\n${texto}`).digest("hex");
}

interface Pendiente {
  id: string;
  texto: string;
  hash: string;
  /** Tenía un vector (ahora desactualizado): si el proveedor falla, se borra. */
  teniaVector: boolean;
}

function pendientesDe(filas: FilaIndexacion[], proveedor: ProveedorEmbeddings): Pendiente[] {
  return filas.flatMap((fila) => {
    const texto = textoParaEmbedding({
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      categoriaNombre: fila.categoria.nombre,
      categoriaPersonalizada: fila.categoriaPersonalizada,
    });
    const hash = hashTexto(texto, proveedor);
    // El mismo texto con el mismo proveedor: el vector guardado sigue valiendo.
    return hash === fila.embeddingTextoHash ? [] : [{ id: fila.id, texto, hash, teniaVector: fila.embeddingTextoHash !== null }];
  });
}

export interface ResultadoIndexacion {
  /** Servicios que necesitaban vector nuevo. */
  pendientes: number;
  vectorizados: number;
  fallidos: number;
  /** Llamadas al proveedor (una por lote). */
  llamadas: number;
}

/**
 * Vectoriza en lotes. Si el proveedor falla con un lote, esos servicios
 * quedan SIN vector (embedding = NULL) y el fallo se registra: un vector
 * viejo describiría un texto que ya no existe. Los servicios siguen
 * apareciendo por la búsqueda de texto, y el script de regeneración los
 * completa después.
 */
async function vectorizarPendientes(
  pendientes: Pendiente[],
  proveedor: ProveedorEmbeddings,
  tamanoLote: number,
): Promise<ResultadoIndexacion> {
  const resultado: ResultadoIndexacion = { pendientes: pendientes.length, vectorizados: 0, fallidos: 0, llamadas: 0 };

  for (let inicio = 0; inicio < pendientes.length; inicio += tamanoLote) {
    const lote = pendientes.slice(inicio, inicio + tamanoLote);
    resultado.llamadas += 1;
    let vectores: number[][];
    try {
      vectores = await proveedor.vectorizar(
        lote.map((pendiente) => pendiente.texto),
        "documento",
      );
      if (vectores.length !== lote.length) throw new Error("El proveedor devolvió una cantidad de vectores distinta de la pedida.");
    } catch (error) {
      // Solo ids (no son datos personales) y el mensaje: nunca el texto ni la clave.
      console.error(
        `No se pudieron calcular los embeddings de ${lote.length} servicio(s); quedan sin vector y aparecen solo por texto.`,
        { servicios: lote.map((pendiente) => pendiente.id) },
        error instanceof Error ? error.message : error,
      );
      for (const pendiente of lote) if (pendiente.teniaVector) await guardarEmbedding(pendiente.id, null);
      resultado.fallidos += lote.length;
      continue;
    }

    for (const [indice, pendiente] of lote.entries()) {
      const vector = vectores[indice];
      if (!vector) continue;
      await guardarEmbedding(pendiente.id, { vector, hash: pendiente.hash });
      resultado.vectorizados += 1;
    }
  }

  return resultado;
}

/** Indexa esos servicios, solo los que lo necesitan (texto nuevo o cambiado). */
export async function indexarServicios(
  ids: string[],
  opciones: { proveedor?: ProveedorEmbeddings; tamanoLote?: number } = {},
): Promise<ResultadoIndexacion> {
  const proveedor = opciones.proveedor ?? obtenerProveedorEmbeddings();
  const filas = await serviciosParaIndexar(ids);
  return vectorizarPendientes(pendientesDe(filas, proveedor), proveedor, opciones.tamanoLote ?? TAMANO_LOTE_EMBEDDINGS);
}

/**
 * Para crear y editar: la publicación nunca falla por los embeddings. El
 * proveedor caído ya lo maneja indexarServicios; esto cubre además un error
 * inesperado (la base, por ejemplo) al guardar el vector.
 */
export async function indexarSinInterrumpir(servicioId: string): Promise<void> {
  try {
    await indexarServicios([servicioId]);
  } catch (error) {
    console.error(`No se pudo indexar el servicio ${servicioId}:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Recorre todo el catálogo y vectoriza los servicios sin vector o con el
 * vector desactualizado, en lotes. Idempotente: la segunda corrida no
 * encuentra pendientes y no llama al proveedor.
 */
export async function regenerarEmbeddings(
  opciones: { proveedor?: ProveedorEmbeddings; tamanoLote?: number } = {},
): Promise<ResultadoIndexacion & { revisados: number }> {
  const proveedor = opciones.proveedor ?? obtenerProveedorEmbeddings();
  const tamanoLote = opciones.tamanoLote ?? TAMANO_LOTE_EMBEDDINGS;
  const pendientes: Pendiente[] = [];
  let revisados = 0;
  let ultimo: string | null = null;

  for (;;) {
    const pagina = await paginaParaIndexar(ultimo, 500);
    if (pagina.length === 0) break;
    revisados += pagina.length;
    pendientes.push(...pendientesDe(pagina, proveedor));
    ultimo = pagina[pagina.length - 1]?.id ?? null;
  }

  return { revisados, ...(await vectorizarPendientes(pendientes, proveedor, tamanoLote)) };
}
