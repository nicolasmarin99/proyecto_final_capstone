import { ErrorHttp } from "../../shared/errores.js";
import { existeComuna } from "../territorio/territorio.repository.js";
import {
  buscarIdPerfil,
  buscarPerfilPorUsuario,
  buscarPrestadorParaContacto,
  buscarServicioParaContacto,
  contarComunasExistentes,
  existePerfil,
  guardarPerfil,
  reemplazarComunasAtencion,
  registrarContacto,
} from "./prestadores.repository.js";
import type { DatosPerfilPrestador } from "./prestadores.schema.js";

const ordenEspanol = new Intl.Collator("es");

type PerfilLeido = NonNullable<Awaited<ReturnType<typeof buscarPerfilPorUsuario>>>;

/** Aplana las comunas de atención (vienen como filas de la tabla intermedia). */
function conComunasAtencion(perfil: PerfilLeido) {
  return {
    ...perfil,
    comunasAtencion: perfil.comunasAtencion
      .map(({ comuna }) => comuna)
      .sort((a, b) => ordenEspanol.compare(a.nombre, b.nombre)),
  };
}

export async function obtenerMiPerfil(usuarioId: string) {
  const perfil = await buscarPerfilPorUsuario(usuarioId);

  // 404 y no un perfil vacío: la web necesita distinguir "todavía no lo
  // creaste" para llevar al prestador a completarlo.
  if (!perfil) {
    throw new ErrorHttp(404, "PERFIL_NO_ENCONTRADO", "Aún no has creado tu perfil de prestador.");
  }

  return conComunasAtencion(perfil);
}

/**
 * Crea o actualiza el perfil. Devuelve si fue una creación, para que el
 * controlador responda 201 o 200 según corresponda.
 */
export async function guardarMiPerfil(usuarioId: string, datos: DatosPerfilPrestador) {
  // La clave foránea también lo impediría, pero respondería un error de base
  // de datos sin campo. Comprobarlo antes permite decir "esta comuna no
  // existe" bajo el selector, con la misma forma que un error de Zod.
  if (!(await existeComuna(datos.comunaId))) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "comunaId", mensaje: "La comuna seleccionada no existe." },
    ]);
  }

  const creado = !(await existePerfil(usuarioId));
  const perfil = await guardarPerfil(usuarioId, datos);

  return { perfil: conComunasAtencion(perfil), creado };
}

function datoInvalido(campo: string, mensaje: string) {
  return new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [{ campo, mensaje }]);
}

export async function definirComunasAtencion(usuarioId: string, comunaIds: number[]) {
  const perfil = await buscarIdPerfil(usuarioId);

  if (!perfil) {
    throw new ErrorHttp(409, "PERFIL_REQUERIDO", "Completa tu perfil de prestador antes de elegir comunas.");
  }

  // Antes de tocar nada: si una no existe, no se borra ninguna de las actuales.
  if ((await contarComunasExistentes(comunaIds)) !== comunaIds.length) {
    throw datoInvalido("comunaIds", "Alguna de las comunas elegidas no existe.");
  }

  const comunas = await reemplazarComunasAtencion(perfil.id, comunaIds);

  return comunas.sort((a, b) => ordenEspanol.compare(a.nombre, b.nombre));
}

/**
 * Entrega el teléfono de un prestador y deja registrado el contacto.
 *
 * - Solo de prestadores con al menos un servicio PUBLICADO: sin esta regla,
 *   cualquiera con sesión podría recorrer ids y juntar los teléfonos de
 *   quienes nunca publicaron nada.
 * - El contacto se registra ANTES de devolver el teléfono: es la prueba de
 *   que hubo una relación, y de él colgará la valoración.
 * - Nadie se contacta a sí mismo: ensuciaría la reputación.
 */
export async function obtenerContacto(usuarioId: string, prestadorId: string, servicioId: string | undefined) {
  const prestador = await buscarPrestadorParaContacto(prestadorId);

  if (!prestador || prestador._count.servicios === 0) {
    throw new ErrorHttp(404, "PRESTADOR_NO_ENCONTRADO", "Ese prestador no existe o no tiene servicios publicados.");
  }

  if (prestador.usuarioId === usuarioId) {
    throw new ErrorHttp(400, "AUTOCONTACTO", "No puedes contactarte a ti mismo.");
  }

  if (servicioId !== undefined) {
    const servicio = await buscarServicioParaContacto(servicioId);

    if (!servicio || servicio.prestadorId !== prestadorId || servicio.estado !== "PUBLICADO") {
      throw datoInvalido("servicio", "Ese servicio no está publicado por este prestador.");
    }
  }

  if (!prestador.telefono) {
    throw new ErrorHttp(409, "SIN_TELEFONO", "Este prestador todavía no registró un teléfono de contacto.");
  }

  await registrarContacto({ clienteId: usuarioId, prestadorId, servicioId: servicioId ?? null });

  return { telefono: prestador.telefono };
}
