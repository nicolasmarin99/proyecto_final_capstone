import { COMUNAS_POR_RESULTADO } from "@localcl/shared";
import type { EstadoServicio } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import {
  actualizarServicio,
  buscarCategoriaActiva,
  buscarServiciosPublicados,
  buscarDuenoServicio,
  buscarPerfilParaPublicar,
  buscarServicioPublico,
  contarReferencias,
  crearServicio,
  eliminarServicio,
  listarCategoriasActivas,
  listarServiciosDe,
} from "./servicios.repository.js";
import { identificadoresDeServicio } from "../imagenes/imagenes.repository.js";
import { motivosDeOcultamiento } from "../reportes/reportes.repository.js";
import { imagenesPropias, imagenPublica, urlMiniatura } from "../imagenes/imagenes.urls.js";
import { obtenerAlmacenamientoPublico } from "../almacenamiento/index.js";
import type { DatosServicio, FiltrosBusqueda } from "./servicios.schema.js";

type ServicioConImagenes = Awaited<ReturnType<typeof crearServicio>>;

/** El servicio del dueño con sus imágenes como direcciones, sin el identificador interno. */
async function conImagenes(servicio: ServicioConImagenes) {
  return { ...servicio, imagenes: await imagenesPropias(servicio.imagenes) };
}

export interface RequisitoPendiente {
  codigo: "IDENTIDAD_NO_VERIFICADA" | "SIN_COMUNAS_ATENCION";
  mensaje: string;
}

type PerfilParaPublicar = NonNullable<Awaited<ReturnType<typeof buscarPerfilParaPublicar>>>;

/**
 * Qué le falta a un prestador para que sus servicios se publiquen. Se
 * calcula siempre en el servidor, con datos de la base: el cliente puede
 * pedir PUBLICADO, pero no decide si lo consigue.
 */
function requisitosPendientes(perfil: PerfilParaPublicar): RequisitoPendiente[] {
  const pendientes: RequisitoPendiente[] = [];

  if (!perfil.usuario.rutVerificado) {
    pendientes.push({
      codigo: "IDENTIDAD_NO_VERIFICADA",
      mensaje: "Verifica tu identidad: sube tu cédula desde tu perfil de prestador.",
    });
  }

  if (perfil._count.comunasAtencion === 0) {
    pendientes.push({
      codigo: "SIN_COMUNAS_ATENCION",
      mensaje: "Indica al menos una comuna donde atiendes.",
    });
  }

  return pendientes;
}

async function perfilRequerido(usuarioId: string) {
  const perfil = await buscarPerfilParaPublicar(usuarioId);

  if (!perfil) {
    throw new ErrorHttp(409, "PERFIL_REQUERIDO", "Completa tu perfil de prestador antes de publicar servicios.");
  }

  return perfil;
}

async function idCategoria(slug: string) {
  const categoria = await buscarCategoriaActiva(slug);

  if (!categoria) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "categoria", mensaje: "Esa categoría no existe." },
    ]);
  }

  return categoria.id;
}

/**
 * El estado con que se guarda. Si lo ocultó un moderador, sigue oculto
 * aunque el prestador lo edite. Si pide publicarlo y le falta algo, queda
 * pausado: el servicio no se pierde y la respuesta dice qué falta.
 */
function estadoFinal(
  pedido: DatosServicio["estado"],
  pendientes: RequisitoPendiente[],
  actual?: EstadoServicio,
): EstadoServicio {
  if (actual === "OCULTO") return "OCULTO";
  return pedido === "PUBLICADO" && pendientes.length === 0 ? "PUBLICADO" : "PAUSADO";
}

function campos(datos: DatosServicio, categoriaId: string, estado: EstadoServicio) {
  return {
    categoriaId,
    categoriaPersonalizada: datos.categoriaPersonalizada,
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    precioDesde: datos.precioDesde,
    precioHasta: datos.precioHasta,
    unidadPrecio: datos.unidadPrecio,
    estado,
  };
}

export async function crear(usuarioId: string, datos: DatosServicio) {
  const perfil = await perfilRequerido(usuarioId);
  const categoriaId = await idCategoria(datos.categoria);
  const pendientes = requisitosPendientes(perfil);

  const servicio = await crearServicio(perfil.id, campos(datos, categoriaId, estadoFinal(datos.estado, pendientes)));

  return { servicio: await conImagenes(servicio), requisitosPendientes: pendientes };
}

/**
 * El dueño se comprueba contra el perfil del token. 404 si el servicio no
 * existe; 403 si existe pero es de otro.
 */
async function servicioPropio(usuarioId: string, id: string) {
  const servicio = await buscarDuenoServicio(id);

  if (!servicio) {
    throw new ErrorHttp(404, "SERVICIO_NO_ENCONTRADO", "Ese servicio no existe.");
  }

  const perfil = await buscarPerfilParaPublicar(usuarioId);

  if (!perfil || perfil.id !== servicio.prestadorId) {
    throw new ErrorHttp(403, "SIN_PERMISOS", "Solo puedes modificar tus propios servicios.");
  }

  return { servicio, perfil };
}

/**
 * Para otros módulos (las imágenes): lanza 404 si el servicio no existe y
 * 403 si es de otro prestador. El dueño sale siempre del token.
 */
export async function exigirDueno(usuarioId: string, servicioId: string): Promise<void> {
  await servicioPropio(usuarioId, servicioId);
}

export async function editar(usuarioId: string, id: string, datos: DatosServicio) {
  const { servicio, perfil } = await servicioPropio(usuarioId, id);
  const categoriaId = await idCategoria(datos.categoria);
  const pendientes = requisitosPendientes(perfil);

  const actualizado = await actualizarServicio(
    id,
    campos(datos, categoriaId, estadoFinal(datos.estado, pendientes, servicio.estado)),
  );

  return { servicio: await conImagenes(actualizado), requisitosPendientes: pendientes };
}

export async function eliminar(usuarioId: string, id: string) {
  await servicioPropio(usuarioId, id);

  if ((await contarReferencias(id)) > 0) {
    // Mensaje neutro a propósito: contactos y reportes bloquean igual, y el
    // prestador no debe poder deducir que su servicio fue reportado.
    throw new ErrorHttp(
      409,
      "SERVICIO_CON_HISTORIAL",
      "Este servicio tiene historial en la plataforma, así que no se puede eliminar. Puedes pausarlo para que deje de mostrarse.",
    );
  }

  // La base borra las filas de imágenes en cascada, pero no puede llamar al
  // proveedor: los archivos se borran acá, después de borrar el servicio.
  // Las moderaciones que haya tenido quedan en la bitácora: no dependen del
  // servicio ni de sus imágenes.
  // Si alguno falla, el servicio igual queda borrado y se registra cuál
  // quedó huérfano (solo su identificador, que no es un dato personal).
  const archivos = await identificadoresDeServicio(id);
  await eliminarServicio(id);

  const almacenamiento = obtenerAlmacenamientoPublico();
  const resultados = await Promise.allSettled(archivos.map((archivo) => almacenamiento.eliminar(archivo)));
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "rejected") {
      console.error(`No se pudo borrar del almacenamiento la imagen ${archivos[indice]} del servicio eliminado.`);
    }
  });
}

/**
 * Los servicios del prestador. Si alguno fue ocultado por moderación, trae
 * el motivo de la decisión y su fecha, y nada más: ni cuántos reportes hubo
 * ni quién reportó.
 */
export async function mios(usuarioId: string) {
  const perfil = await perfilRequerido(usuarioId);
  const servicios = await Promise.all((await listarServiciosDe(perfil.id)).map(conImagenes));
  const moderados = await motivosDeOcultamiento(servicios.filter((servicio) => servicio.estado === "OCULTO").map((servicio) => servicio.id));

  return {
    servicios: servicios.map((servicio) => {
      const moderacion = servicio.estado === "OCULTO" ? moderados.get(servicio.id) : undefined;
      return { ...servicio, moderacion: moderacion ? { motivo: moderacion.motivo, ocultadoEn: moderacion.creadoEn } : null };
    }),
    requisitosPendientes: requisitosPendientes(perfil),
  };
}

const ordenEspanol = new Intl.Collator("es");

/**
 * La vista pública se arma campo por campo, en vez de devolver lo que trae
 * la consulta: así, si mañana alguien agrega un campo al select, no se
 * publica sin que nadie lo decida.
 */
export async function publico(id: string) {
  const servicio = await buscarServicioPublico(id);

  if (!servicio) {
    throw new ErrorHttp(404, "SERVICIO_NO_ENCONTRADO", "Ese servicio no existe o no está publicado.");
  }

  return {
    id: servicio.id,
    titulo: servicio.titulo,
    descripcion: servicio.descripcion,
    precioDesde: servicio.precioDesde,
    precioHasta: servicio.precioHasta,
    unidadPrecio: servicio.unidadPrecio,
    categoria: servicio.categoria,
    // Con «Otros», el nombre que escribió el prestador; nulo en el resto.
    categoriaPersonalizada: servicio.categoriaPersonalizada,
    actualizadoEn: servicio.actualizadoEn,
    // Solo las visibles (lo filtra la consulta), en el orden que eligió el prestador.
    imagenes: servicio.imagenes.map((imagen) => imagenPublica(imagen.id, imagen.identificador)),
    prestador: {
      id: servicio.prestador.id,
      nombre: servicio.prestador.usuario.nombre,
      comunas: servicio.prestador.comunasAtencion
        .map(({ comuna }) => ({ id: comuna.id, nombre: comuna.nombre, region: comuna.region.nombre }))
        .sort((a, b) => ordenEspanol.compare(a.nombre, b.nombre)),
      credenciales: servicio.prestador.credenciales.map((credencial) => ({
        tipo: credencial.tipo.nombre,
        emisor: credencial.tipo.fuenteOficial,
        verificadaEn: credencial.fechaConsulta,
        // La distinción que importa para confiar: contrastada contra el
        // registro del organismo, o revisada a mano por el equipo.
        acreditacion: credencial.metodo === "AUTOMATICO" ? "REGISTRO_OFICIAL" : "REVISADA_POR_LOCALCL",
      })),
    },
  };
}

export async function categorias() {
  return listarCategoriasActivas();
}

/** Más términos no afinan la búsqueda y solo encarecen la consulta. */
const MAXIMO_TERMINOS = 8;

/**
 * Convierte lo que escribió la persona en una tsquery por prefijos:
 * «Gasfiter domicilio» → «Gasfiter:* & domicilio:*».
 *
 * Solo sobreviven letras y dígitos (de cualquier idioma, con o sin tilde);
 * todo lo demás separa palabras. Por eso comillas, apóstrofes, «&», «|»,
 * «!», «:» o paréntesis nunca llegan a to_tsquery como operadores: no
 * pueden romper su sintaxis. Y aunque llegaran, viajan como parámetro de la
 * consulta, nunca como parte del SQL.
 *
 * null si no queda ninguna palabra: es una búsqueda sin texto.
 */
export function consultaPorPrefijos(texto: string | undefined): string | null {
  const terminos = (texto ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((termino) => termino.length > 0)
    .slice(0, MAXIMO_TERMINOS);

  return terminos.length > 0 ? terminos.map((termino) => `${termino}:*`).join(" & ") : null;
}

/**
 * Búsqueda pública: solo servicios PUBLICADOS de prestadores con la
 * identidad verificada. Como en publico(), la respuesta se arma campo por
 * campo: del prestador salen su nombre, hasta tres comunas y si tiene
 * credenciales acreditadas. Nunca teléfono, correo ni RUT.
 */
export async function buscar(filtros: FiltrosBusqueda) {
  const filas = await buscarServiciosPublicados({
    consulta: consultaPorPrefijos(filtros.q),
    categoria: filtros.categoria ?? null,
    comuna: filtros.comuna ?? null,
    precioMax: filtros.precioMax ?? null,
    orden: filtros.orden,
    limite: filtros.porPagina,
    desplazamiento: (filtros.pagina - 1) * filtros.porPagina,
    comunasPorResultado: COMUNAS_POR_RESULTADO,
  });

  return {
    resultados: filas.map((fila) => {
      const comunas = fila.comunas ?? [];
      return {
        id: fila.id,
        titulo: fila.titulo,
        categoria: { slug: fila.categoriaSlug, nombre: fila.categoriaNombre },
        categoriaPersonalizada: fila.categoriaPersonalizada,
        precioDesde: fila.precioDesde,
        precioHasta: fila.precioHasta,
        unidadPrecio: fila.unidadPrecio,
        // Explícito para quien consuma la API sin conocer la convención.
        aConvenir: fila.precioDesde === null,
        // Solo la primera imagen visible, en tamaño de miniatura; null si no tiene.
        imagen: fila.imagenIdentificador ? urlMiniatura(fila.imagenIdentificador) : null,
        prestador: {
          nombre: fila.prestadorNombre,
          comunas,
          comunasRestantes: Math.max(0, fila.totalComunas - comunas.length),
          acreditado: fila.acreditado,
        },
      };
    }),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    // Fuera de rango (pagina más allá del final) no hay filas de donde leerlo.
    total: filas[0]?.total ?? 0,
  };
}
