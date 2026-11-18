import { ErrorHttp } from "../../shared/errores.js";
import { serviciosVisiblesEntre } from "../servicios/servicios.visibilidad.js";
import {
  actualizarContratacion,
  buscarContratacion,
  buscarServicio,
  contratacionesDe,
  contratacionesDeServicio,
  crearContratacion,
  eliminarContratacion,
  tieneContactoCon,
  valoracionesDelClienteEn,
  type FilaContratacion,
  type ResultadoEscritura,
} from "./contrataciones.repository.js";
import type { DatosCrearContratacion, DatosEditarContratacion } from "./contrataciones.schema.js";

/*
  REGLA CENTRAL: una contratación es PRIVADA DE SU CLIENTE.

  - Cada función recibe el id de quien pide (sale del token) y solo devuelve
    o cambia filas suyas. Ninguna recibe un clienteId desde la petición.
  - No hay ninguna función que liste por prestador ni por servicio para otro
    usuario, ni que cuente cuántos marcaron un servicio. El prestador no la
    confirma, no la ve y no recibe ningún aviso.
  - Borrar un servicio no la cuenta como historial (servicios.repository,
    contarReferencias): si lo bloqueara, el prestador deduciría que alguien
    lo marcó.

  Es un historial personal, no una transacción confirmada por las dos partes.
*/

function contratacionAjena(): ErrorHttp {
  return new ErrorHttp(403, "CONTRATACION_AJENA", "Solo puedes ver y cambiar tus propios servicios contratados.");
}

function contratacionNoEncontrada(): ErrorHttp {
  return new ErrorHttp(404, "CONTRATACION_NO_ENCONTRADA", "Ese registro no existe.");
}

function duplicada(): ErrorHttp {
  return new ErrorHttp(409, "CONTRATACION_DUPLICADA", "Ya registraste este servicio en esa fecha.");
}

function servicioNoEncontrado(): ErrorHttp {
  return new ErrorHttp(404, "SERVICIO_NO_ENCONTRADO", "Ese servicio no existe.");
}

/** DATE de la base (medianoche UTC) → «AAAA-MM-DD», sin que la zona horaria lo corra un día. */
function comoTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Lo que el cliente ve de un registro suyo. Nunca el clienteId: ya sabe que es suyo. */
function vista(fila: FilaContratacion, contexto: { visibles: Set<string>; valoraciones: Map<string, string> }) {
  const valoracionId = fila.servicioId ? contexto.valoraciones.get(fila.servicioId) : undefined;
  return {
    id: fila.id,
    fechaContratacion: comoTexto(fila.fechaContratacion),
    notas: fila.notas,
    // El título y el nombre son las copias del momento del registro: se
    // leen igual aunque la publicación o la cuenta ya no existan.
    servicio: {
      id: fila.servicioId,
      titulo: fila.tituloServicio,
      // Si se borró, o el público ya no la ve (pausada, oculta): no hay página a la que llevar.
      disponible: fila.servicioId !== null && contexto.visibles.has(fila.servicioId),
    },
    prestador: { nombre: fila.nombrePrestador },
    valoracion: valoracionId ? { id: valoracionId } : null,
    creadaEn: fila.creadoEn,
    actualizadaEn: fila.actualizadoEn,
  };
}

/** Para varias filas: visibilidad y valoraciones en dos consultas, no una por fila. */
async function vistas(clienteId: string, filas: FilaContratacion[]) {
  const servicioIds = [...new Set(filas.flatMap((fila) => (fila.servicioId ? [fila.servicioId] : [])))];
  const [visibles, valoraciones] = await Promise.all([serviciosVisiblesEntre(servicioIds), valoracionesDelClienteEn(clienteId, servicioIds)]);
  return filas.map((fila) => vista(fila, { visibles, valoraciones }));
}

type Habilitacion =
  | { puede: true; servicio: NonNullable<Awaited<ReturnType<typeof buscarServicio>>> }
  | { puede: false; motivo: "PROPIO" | "SIN_CONTACTO" };

/**
 * ¿Puede registrar ese servicio? 404 si no existe. Las reglas:
 * - Nadie registra sus propios servicios (un prestador sí puede registrar
 *   los de OTRO prestador que contrató, igual que al valorar).
 * - Hace falta un contacto registrado con ESE PRESTADOR, por cualquiera de
 *   sus servicios: quien lo contactó por un arreglo puede haberle contratado
 *   después otro de sus servicios.
 */
async function habilitacion(usuarioId: string, servicioId: string): Promise<Habilitacion> {
  const servicio = await buscarServicio(servicioId);
  if (!servicio) throw servicioNoEncontrado();
  if (servicio.prestador.usuarioId === usuarioId) return { puede: false, motivo: "PROPIO" };
  if (!(await tieneContactoCon(usuarioId, servicio.prestadorId))) return { puede: false, motivo: "SIN_CONTACTO" };
  return { puede: true, servicio };
}

/** Del resultado de una escritura, la vista o el error que corresponde. */
async function resolver(usuarioId: string, resultado: ResultadoEscritura) {
  if (resultado.resultado === "duplicada") throw duplicada();
  if (resultado.resultado === "no_existe") throw contratacionNoEncontrada();
  const [creada] = await vistas(usuarioId, [resultado.contratacion]);
  if (!creada) throw contratacionNoEncontrada();
  return creada;
}

/**
 * Registra que el cliente contrató el servicio. El prestador y las copias
 * del título y del nombre salen de la base en este momento, nunca de la
 * petición.
 */
export async function registrar(usuarioId: string, datos: DatosCrearContratacion) {
  const habilitado = await habilitacion(usuarioId, datos.servicioId);
  if (!habilitado.puede) {
    throw habilitado.motivo === "PROPIO"
      ? new ErrorHttp(403, "CONTRATACION_PROPIA", "Este servicio es tuyo: no puedes registrarlo como contratado.")
      : new ErrorHttp(403, "SIN_CONTACTO", "Solo puedes registrar servicios de prestadores que contactaste desde LocalCL.");
  }
  const { servicio } = habilitado;

  return resolver(
    usuarioId,
    await crearContratacion({
      clienteId: usuarioId,
      servicioId: servicio.id,
      prestadorId: servicio.prestadorId,
      fechaContratacion: datos.fechaContratacion,
      tituloServicio: servicio.titulo,
      nombrePrestador: servicio.prestador.usuario.nombre,
      notas: datos.notas,
    }),
  );
}

/** El registro debe existir (404) y ser de quien pide (403). */
async function propia(usuarioId: string, id: string) {
  const contratacion = await buscarContratacion(id);
  if (!contratacion) throw contratacionNoEncontrada();
  if (contratacion.clienteId !== usuarioId) throw contratacionAjena();
  return contratacion;
}

export async function editar(usuarioId: string, id: string, datos: DatosEditarContratacion) {
  await propia(usuarioId, id);
  return resolver(usuarioId, await actualizarContratacion(id, usuarioId, datos));
}

export async function eliminar(usuarioId: string, id: string) {
  await propia(usuarioId, id);
  if (!(await eliminarContratacion(id, usuarioId))) throw contratacionNoEncontrada();
}

/** Las propias, paginadas, de la más reciente a la más antigua. */
export async function mias(usuarioId: string, pagina: number, porPagina: number) {
  const { contrataciones, total } = await contratacionesDe(usuarioId, pagina, porPagina);
  return { contrataciones: await vistas(usuarioId, contrataciones), pagina, porPagina, total };
}

/**
 * Para la página de un servicio: si quien mira puede registrarlo y lo que
 * ya registró de ESE servicio. Solo habla de sus propios registros.
 */
export async function estadoEnServicio(usuarioId: string, servicioId: string) {
  const habilitado = await habilitacion(usuarioId, servicioId);
  const propias = habilitado.puede || habilitado.motivo === "SIN_CONTACTO" ? await contratacionesDeServicio(usuarioId, servicioId) : [];
  return {
    puedeRegistrar: habilitado.puede,
    motivo: habilitado.puede ? null : habilitado.motivo,
    contrataciones: await vistas(usuarioId, propias),
  };
}
