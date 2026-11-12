import { DIAS_PARA_VALORAR } from "@localcl/shared";
import { ErrorHttp } from "../../shared/errores.js";
import { contarServiciosVisiblesDe } from "../servicios/servicios.visibilidad.js";
import {
  buscarPerfilDelUsuario,
  buscarPrestador,
  buscarValoracion,
  crearObjecion,
  crearValoracion,
  ultimoContacto,
  valoracionDe,
  valoracionesPublicadas,
  valoracionesRecibidas,
} from "./valoraciones.repository.js";
import { resumenDe } from "./valoraciones.resumen.js";
import type { DatosObjecion, DatosValoracion } from "./valoraciones.schema.js";

/*
  REGLA CENTRAL: el prestador NO puede eliminar ni ocultar una valoración.
  Solo puede objetarla (objetar()), y quien decide es un administrador, en
  la cola de reportes (reportes.service.ts). Si el prestador pudiera vetar
  reseñas, su perfil solo mostraría las positivas y la reputación no
  valdría nada. En este archivo no hay ninguna función que cambie el estado
  de una valoración.

  Y una valoración es DEFINITIVA: su autor tampoco la edita ni la retira.
  Así lo que el prestador objeta y lo que el administrador revisa es
  exactamente lo que se publicó, y nadie puede reescribir una reseña
  después (por ejemplo, tras una presión del prestador).
*/

const DIA_MS = 24 * 60 * 60 * 1000;

function prestadorNoEncontrado(): ErrorHttp {
  return new ErrorHttp(404, "PRESTADOR_NO_ENCONTRADO", "Ese prestador no existe o no tiene servicios publicados.");
}

/**
 * Un prestador sin servicios visibles no existe para el público: ni se
 * valora ni se listan sus valoraciones. La misma regla y la misma respuesta
 * que su perfil y el contacto.
 */
async function prestadorVisible(prestadorId: string) {
  const prestador = await buscarPrestador(prestadorId);
  if (!prestador || (await contarServiciosVisiblesDe(prestadorId)) === 0) throw prestadorNoEncontrado();
  return prestador;
}

/** «Juan Pérez Soto» → «Juan». Lo único del cliente que se publica. */
export function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

type Elegibilidad =
  | { puede: true; contactoId: string; plazoHasta: Date }
  | { puede: false; motivo: "SIN_CONTACTO" | "PLAZO_VENCIDO"; plazoHasta: Date | null };

/** ¿Puede valorar hoy? Solo con un contacto registrado en los últimos DIAS_PARA_VALORAR días. */
async function elegibilidad(clienteId: string, prestadorId: string): Promise<Elegibilidad> {
  const contacto = await ultimoContacto(clienteId, prestadorId);
  if (!contacto) return { puede: false, motivo: "SIN_CONTACTO", plazoHasta: null };

  const plazoHasta = new Date(contacto.creadoEn.getTime() + DIAS_PARA_VALORAR * DIA_MS);
  if (Date.now() > plazoHasta.getTime()) return { puede: false, motivo: "PLAZO_VENCIDO", plazoHasta };
  return { puede: true, contactoId: contacto.id, plazoHasta };
}

/** Cómo ve el cliente su propia valoración. */
function vistaPropia(valoracion: {
  id: string;
  calificacion: number;
  comentario: string | null;
  estado: string;
  creadoEn: Date;
  editadaEn: Date | null;
}) {
  return {
    id: valoracion.id,
    calificacion: valoracion.calificacion,
    comentario: valoracion.comentario,
    estado: valoracion.estado,
    // El cliente sabe que se ocultó, no el detalle de la moderación.
    ocultaPorModeracion: valoracion.estado === "OCULTA",
    creadaEn: valoracion.creadoEn,
    editada: valoracion.editadaEn !== null,
    editadaEn: valoracion.editadaEn,
  };
}

function yaValorada(): ErrorHttp {
  return new ErrorHttp(409, "VALORACION_YA_EXISTE", "Ya valoraste a este prestador. Una valoración publicada no se puede editar ni retirar.");
}

/**
 * Publica la valoración del cliente. Reglas, en este orden:
 * 1. El prestador debe estar visible (404).
 * 2. Nadie se valora a sí mismo (403). Ya lo impide exigir el rol CLIENTE;
 *    se revisa igual por si un día cambian los roles.
 * 3. Una por cliente y prestador, y definitiva: si ya existe, 409. Va antes
 *    del plazo para no decirle «plazo vencido» a quien ya valoró.
 * 4. Un contacto registrado con ese prestador (403) y dentro de los
 *    últimos 60 días (403).
 */
export async function valorar(clienteId: string, prestadorId: string, datos: DatosValoracion) {
  const prestador = await prestadorVisible(prestadorId);
  if (prestador.usuarioId === clienteId) {
    throw new ErrorHttp(403, "AUTOVALORACION", "No puedes valorarte a ti mismo.");
  }
  if (await valoracionDe(clienteId, prestadorId)) throw yaValorada();

  const habilitado = await elegibilidad(clienteId, prestadorId);
  if (!habilitado.puede) {
    throw habilitado.motivo === "SIN_CONTACTO"
      ? new ErrorHttp(403, "SIN_CONTACTO", "Solo puedes valorar a un prestador que hayas contactado desde LocalCL.")
      : new ErrorHttp(403, "PLAZO_VENCIDO", `Solo puedes valorar dentro de los ${DIAS_PARA_VALORAR} días desde que lo contactaste.`);
  }

  // La revisión de arriba da el mensaje; esta, bajo bloqueo, cubre dos envíos simultáneos.
  const resultado = await crearValoracion({ clienteId, prestadorId, contactoId: habilitado.contactoId, ...datos });
  if (resultado.resultado === "ya_existe") throw yaValorada();
  return vistaPropia(resultado.valoracion);
}

/**
 * Lo que el cliente necesita para el formulario: su valoración, si la hay, y
 * si puede valorar hoy. Solo habla del propio cliente: nada de las
 * valoraciones de otros.
 */
export async function mia(clienteId: string, prestadorId: string) {
  await prestadorVisible(prestadorId);
  const [valoracion, habilitado] = await Promise.all([valoracionDe(clienteId, prestadorId), elegibilidad(clienteId, prestadorId)]);

  return {
    valoracion: valoracion ? vistaPropia(valoracion) : null,
    // Con una valoración ya publicada no hay nada más que hacer: es definitiva.
    puedeValorar: valoracion === null && habilitado.puede,
    motivo: valoracion !== null ? "YA_VALORADA" : habilitado.puede ? null : habilitado.motivo,
    plazoHasta: valoracion === null ? habilitado.plazoHasta : null,
  };
}

/**
 * Lista pública, paginada, solo PUBLICADAS. Del cliente sale el nombre de
 * pila y la foto (null: el modelo todavía no tiene foto de perfil).
 */
export async function publicas(prestadorId: string, pagina: number, porPagina: number) {
  await prestadorVisible(prestadorId);
  const [{ valoraciones, total }, resumen] = await Promise.all([
    valoracionesPublicadas(prestadorId, pagina, porPagina),
    resumenDe(prestadorId),
  ]);

  return {
    resumen,
    valoraciones: valoraciones.map((valoracion) => ({
      id: valoracion.id,
      calificacion: valoracion.calificacion,
      comentario: valoracion.comentario,
      creadaEn: valoracion.creadoEn,
      editada: valoracion.editadaEn !== null,
      editadaEn: valoracion.editadaEn,
      cliente: { nombre: nombreDePila(valoracion.contacto.cliente.nombre), foto: null },
    })),
    pagina,
    porPagina,
    total,
  };
}

/** /prestadores/yo/valoraciones: lo que recibió, con el estado de sus objeciones. */
export async function recibidas(usuarioId: string, pagina: number, porPagina: number) {
  const perfil = await buscarPerfilDelUsuario(usuarioId);
  if (!perfil) {
    throw new ErrorHttp(409, "PERFIL_REQUERIDO", "Completa tu perfil de prestador para ver tus valoraciones.");
  }
  const [{ valoraciones, total }, resumen] = await Promise.all([
    valoracionesRecibidas(perfil.id, pagina, porPagina),
    resumenDe(perfil.id),
  ]);

  return {
    resumen,
    valoraciones: valoraciones.map((valoracion) => {
      const [objecion] = valoracion.denuncias;
      const [retiro] = valoracion.decisiones;
      return {
        id: valoracion.id,
        calificacion: valoracion.calificacion,
        comentario: valoracion.comentario,
        estado: valoracion.estado,
        creadaEn: valoracion.creadoEn,
        editada: valoracion.editadaEn !== null,
        cliente: { nombre: nombreDePila(valoracion.contacto.cliente.nombre) },
        objecion: objecion
          ? {
              motivo: objecion.motivo,
              comentario: objecion.detalle,
              estado: objecion.estado,
              enviadaEn: objecion.creadoEn,
              // La resolución del administrador, cuando ya decidió.
              resolucion: objecion.resolucion,
              decididaEn: objecion.resueltaEn,
            }
          : null,
        // Si se ocultó: el motivo y la fecha de esa decisión.
        retirada: valoracion.estado === "OCULTA" && retiro ? { motivo: retiro.motivo, en: retiro.creadoEn } : null,
      };
    }),
    pagina,
    porPagina,
    total,
  };
}

/**
 * El prestador objeta una valoración que recibió. No cambia nada de la
 * valoración: la pone en la cola de reportes para que decida un
 * administrador. Una sola vez por valoración.
 */
export async function objetar(usuarioId: string, valoracionId: string, datos: DatosObjecion) {
  const valoracion = await buscarValoracion(valoracionId);
  if (!valoracion) {
    throw new ErrorHttp(404, "VALORACION_NO_ENCONTRADA", "Esa valoración no existe.");
  }
  if (valoracion.contacto.prestador.usuarioId !== usuarioId) {
    throw new ErrorHttp(403, "OBJECION_NO_PERMITIDA", "Solo puedes objetar valoraciones que recibiste tú.");
  }
  if (valoracion.estado === "OCULTA") {
    throw new ErrorHttp(409, "VALORACION_YA_OCULTA", "Esta valoración ya fue retirada por moderación.");
  }

  const resultado = await crearObjecion({ valoracionId, denuncianteId: usuarioId, motivo: datos.motivo, comentario: datos.comentario });
  if (resultado === "ya_objetada") {
    throw new ErrorHttp(409, "VALORACION_YA_OBJETADA", "Ya objetaste esta valoración. Solo se puede objetar una vez.");
  }
  return { mensaje: "Recibimos tu objeción. Un administrador la revisará." };
}
