import { MAXIMO_REPORTES_POR_DIA, PERSONAS_PRIORIDAD_ALTA } from "@localcl/shared";
import type { AccionReporte } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import {
  buscarServicioReportable,
  categoriasDelUsuario,
  colaAgrupada,
  crearReporte,
  detalleReportes,
  registrarDecision,
  registrarDecisionValoracion,
  reporteAbiertoDe,
  retirarReporte,
  ultimasDecisiones,
} from "./reportes.repository.js";
import { servicioNoVisible } from "../servicios/servicios.service.js";
import { esServicioVisible } from "../servicios/servicios.visibilidad.js";
import type { DatosReporte, FiltrosCola } from "./reportes.schema.js";

/*
  REGLA CENTRAL: los reportes nunca ocultan una publicación por sí solos.
  Nada en este archivo cambia el estado de un servicio salvo decidir(), que
  solo llama un administrador. Un umbral automático sería manipulable con
  denuncias coordinadas entre competidores: los reportes solo ordenan la
  cola de revisión.
*/

const UNA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Lo que se responde al reportar, haya o no un reporte previo de la misma persona. */
const RESPUESTA_REPORTE = { mensaje: "Gracias. Revisaremos esta publicación." } as const;

/**
 * Un servicio que el público no ve no se puede reportar: para el público, no
 * existe. La misma regla y la misma respuesta que su página.
 */
async function servicioPublicado(servicioId: string) {
  const servicio = await buscarServicioReportable(servicioId);
  if (!servicio || !(await esServicioVisible(servicioId))) throw servicioNoVisible();
  return servicio;
}

/**
 * Crea un reporte. Reglas, en este orden:
 * 1. El servicio debe estar publicado (404 si no).
 * 2. Un prestador no reporta su propio servicio ni uno de su misma
 *    categoría: evita hundir a la competencia (403).
 * 3. A lo más MAXIMO_REPORTES_POR_DIA en 24 horas (429).
 * 4. Uno abierto por persona y servicio.
 *
 * Responde LO MISMO se haya creado o ya existiera: un segundo envío no
 * revela si había un reporte previo. El límite se revisa antes que el
 * duplicado, así que tampoco por esa vía se distingue.
 */
export async function reportar(usuarioId: string, servicioId: string, datos: DatosReporte) {
  const servicio = await servicioPublicado(servicioId);

  if (servicio.prestador.usuarioId === usuarioId) {
    throw new ErrorHttp(403, "REPORTE_NO_PERMITIDO", "No puedes reportar tu propio servicio.");
  }
  if ((await categoriasDelUsuario(usuarioId)).has(servicio.categoriaId)) {
    throw new ErrorHttp(
      403,
      "REPORTE_NO_PERMITIDO",
      "No puedes reportar servicios de una categoría en la que tú también ofreces servicios.",
    );
  }

  const resultado = await crearReporte(
    { denuncianteId: usuarioId, servicioId, motivo: datos.motivo, comentario: datos.comentario },
    MAXIMO_REPORTES_POR_DIA,
  );

  if (resultado === "limite") {
    throw new ErrorHttp(
      429,
      "DEMASIADOS_REPORTES",
      `Puedes enviar hasta ${MAXIMO_REPORTES_POR_DIA} reportes en 24 horas. Inténtalo más tarde.`,
    );
  }

  // "creado" y "ya_existia" se responden igual, a propósito.
  return RESPUESTA_REPORTE;
}

/** Retira el reporte propio, si había uno abierto. Idempotente: no dice si existía. */
export async function retirar(usuarioId: string, servicioId: string) {
  await retirarReporte(usuarioId, servicioId);
}

/** Solo para quien pregunta: si tiene un reporte abierto sobre este servicio. */
export async function miReporte(usuarioId: string, servicioId: string) {
  const reporte = await reporteAbiertoDe(usuarioId, servicioId);
  return reporte ? { motivo: reporte.motivo, enviadoEn: reporte.creadoEn } : null;
}

// ─── Administración ────────────────────────────────────────────────────────

/**
 * La cola: servicios reportados (agrupados por servicio) y valoraciones
 * objetadas, en una sola lista. Nunca incluye quién reportó.
 */
export async function cola(filtros: FiltrosCola) {
  const filas = await colaAgrupada({
    estado: filtros.estado,
    umbralPrioridad: PERSONAS_PRIORIDAD_ALTA,
    limite: filtros.porPagina,
    desplazamiento: (filtros.pagina - 1) * filtros.porPagina,
  });
  const decisiones =
    filtros.estado === "resueltos"
      ? await ultimasDecisiones(
          filas.filter((fila) => fila.tipo === "SERVICIO").map((fila) => fila.id),
          filas.filter((fila) => fila.tipo === "VALORACION").map((fila) => fila.id),
        )
      : new Map<string, { accion: AccionReporte; motivo: string; creadoEn: Date }>();
  const ahora = Date.now();

  return {
    casos: filas.map((fila) => {
      const decision = decisiones.get(fila.id);
      const comun = {
        personas: fila.personas,
        reportes: fila.reportes,
        motivoFrecuente: fila.motivoFrecuente,
        prioridad: fila.personas >= PERSONAS_PRIORIDAD_ALTA ? "ALTA" : "NORMAL",
        primerReporte: fila.primerReporte,
        // Cuánto lleva esperando una decisión (solo en pendientes).
        esperaMinutos: filtros.estado === "pendientes" ? Math.max(0, Math.floor((ahora - fila.primerReporte.getTime()) / 60_000)) : null,
        decision: decision ? { accion: decision.accion, motivo: decision.motivo, decididaEn: decision.creadoEn } : null,
      };
      if (fila.tipo === "VALORACION") {
        return {
          tipo: "VALORACION" as const,
          // Lo que el administrador necesita para decidir: el texto, la
          // calificación y la objeción. Del cliente, nada.
          valoracion: {
            id: fila.id,
            calificacion: fila.calificacion,
            comentario: fila.comentario,
            estado: fila.estadoObjeto,
            editada: fila.editadaEn !== null,
            prestador: fila.prestador,
          },
          objecion: { motivo: fila.motivoFrecuente, comentario: fila.detalleObjecion },
          ...comun,
        };
      }
      return {
        tipo: "SERVICIO" as const,
        servicio: { id: fila.id, titulo: fila.titulo, estado: fila.estadoObjeto, prestador: fila.prestador },
        ...comun,
      };
    }),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    total: filas[0]?.total ?? 0,
  };
}

/**
 * Detalle de los reportes de un servicio. De quien reportó solo sale si su
 * cuenta tenía más de una semana al momento de reportar (una señal útil
 * contra cuentas creadas para denunciar en grupo); nunca quién es.
 */
export async function detalle(servicioId: string) {
  const { servicio, denuncias, decisiones, personas } = await detalleReportes(servicioId);

  if (!servicio) {
    throw new ErrorHttp(404, "SERVICIO_NO_ENCONTRADO", "Ese servicio no existe.");
  }

  return {
    servicio: {
      id: servicio.id,
      titulo: servicio.titulo,
      estado: servicio.estado,
      categoria: servicio.categoriaPersonalizada ?? servicio.categoria.nombre,
      prestador: servicio.prestador.usuario.nombre,
    },
    reportes: denuncias.map((denuncia) => ({
      // Un identificador propio del reporte, para la lista; no el de la persona.
      id: denuncia.id,
      motivo: denuncia.motivo,
      comentario: denuncia.detalle,
      estado: denuncia.estado,
      enviadoEn: denuncia.creadoEn,
      cuentaConMasDeUnaSemana: denuncia.creadoEn.getTime() - denuncia.denunciante.creadoEn.getTime() > UNA_SEMANA_MS,
    })),
    personas,
    decisiones: decisiones.map((decision) => ({
      accion: decision.accion,
      motivo: decision.motivo,
      reportesCerrados: decision.reportesCerrados,
      decididaEn: decision.creadoEn,
      administrador: decision.administrador.nombre,
    })),
  };
}

/** Desestima u oculta: siempre una persona, siempre con motivo, siempre en la bitácora. */
export async function decidir(servicioId: string, administradorId: string, accion: AccionReporte, motivo: string) {
  const resultado = await registrarDecision({ servicioId, administradorId, accion, motivo });

  if (resultado === "sin_servicio") {
    throw new ErrorHttp(404, "SERVICIO_NO_ENCONTRADO", "Ese servicio no existe.");
  }
  if (resultado === "sin_pendientes") {
    throw new ErrorHttp(409, "SIN_REPORTES_PENDIENTES", "Este servicio no tiene reportes pendientes que desestimar.");
  }
  if (resultado === "ya_oculto") {
    throw new ErrorHttp(409, "SERVICIO_YA_OCULTO", "Este servicio ya estaba oculto.");
  }

  return detalle(servicioId);
}

/**
 * Desestima la objeción u oculta la valoración. Siempre un administrador,
 * siempre con motivo, siempre en la bitácora. Es la única forma de que una
 * valoración deje de estar publicada.
 */
export async function decidirValoracion(
  valoracionId: string,
  administradorId: string,
  accion: "DESESTIMAR" | "OCULTAR_VALORACION",
  motivo: string,
) {
  const resultado = await registrarDecisionValoracion({ valoracionId, administradorId, accion, motivo });

  if (resultado === "sin_valoracion") {
    throw new ErrorHttp(404, "VALORACION_NO_ENCONTRADA", "Esa valoración no existe.");
  }
  if (resultado === "sin_pendientes") {
    throw new ErrorHttp(409, "SIN_OBJECION_PENDIENTE", "Esta valoración no tiene una objeción pendiente que desestimar.");
  }
  if (resultado === "ya_oculta") {
    throw new ErrorHttp(409, "VALORACION_YA_OCULTA", "Esta valoración ya estaba oculta.");
  }

  return { valoracion: { id: valoracionId, estado: accion === "OCULTAR_VALORACION" ? "OCULTA" : "PUBLICADA" }, accion, motivo };
}

