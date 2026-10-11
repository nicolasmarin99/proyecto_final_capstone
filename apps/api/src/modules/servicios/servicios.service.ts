import type { EstadoServicio } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import {
  actualizarServicio,
  buscarCategoriaActiva,
  buscarDuenoServicio,
  buscarPerfilParaPublicar,
  buscarServicioPublico,
  contarReferencias,
  crearServicio,
  eliminarServicio,
  listarCategoriasActivas,
  listarServiciosDe,
} from "./servicios.repository.js";
import type { DatosServicio } from "./servicios.schema.js";

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

  return { servicio, requisitosPendientes: pendientes };
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

export async function editar(usuarioId: string, id: string, datos: DatosServicio) {
  const { servicio, perfil } = await servicioPropio(usuarioId, id);
  const categoriaId = await idCategoria(datos.categoria);
  const pendientes = requisitosPendientes(perfil);

  const actualizado = await actualizarServicio(
    id,
    campos(datos, categoriaId, estadoFinal(datos.estado, pendientes, servicio.estado)),
  );

  return { servicio: actualizado, requisitosPendientes: pendientes };
}

export async function eliminar(usuarioId: string, id: string) {
  await servicioPropio(usuarioId, id);

  if ((await contarReferencias(id)) > 0) {
    throw new ErrorHttp(
      409,
      "SERVICIO_CON_CONTACTOS",
      "Este servicio ya tiene contactos registrados, así que no se puede eliminar. Puedes pausarlo para que deje de mostrarse.",
    );
  }

  await eliminarServicio(id);
}

export async function mios(usuarioId: string) {
  const perfil = await perfilRequerido(usuarioId);

  return {
    servicios: await listarServiciosDe(perfil.id),
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
