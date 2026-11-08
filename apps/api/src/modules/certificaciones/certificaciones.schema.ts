import {
  CODIGO_CERTIFICACION_OTRA,
  CODIGO_CURSO,
  HORAS_MAXIMAS_CURSO,
  HORAS_MINIMAS_CURSO,
  LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION,
  LARGO_MAXIMO_NOMBRE_CERTIFICACION,
  LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION,
  LARGO_MINIMO_NOMBRE_CERTIFICACION,
} from "@localcl/shared";
import { z } from "zod";
import { EstadoCredencial } from "../../generated/prisma/client.js";

/** Un campo multipart vacío cuenta como ausente. */
function vacioComoAusente(valor: unknown) {
  return typeof valor === "string" && valor.trim() === "" ? undefined : valor;
}

/** Un campo de texto opcional de un formulario multipart. */
function textoOpcional(minimo: number, maximo: number, nombre: string) {
  return z.preprocess(
    vacioComoAusente,
    z
      .string({ error: `${nombre} debe ser texto.` })
      .trim()
      .min(minimo, `${nombre} debe tener al menos ${minimo} caracteres.`)
      .max(maximo, `${nombre} no puede superar los ${maximo} caracteres.`)
      .optional(),
  );
}

/** Una fecha AAAA-MM-DD opcional. */
function fechaOpcional() {
  return z.preprocess(
    vacioComoAusente,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha como AAAA-MM-DD.")
      .refine((fecha) => !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`)), "Esa fecha no existe.")
      .optional(),
  );
}

/** Hoy en Chile, como fecha AAAA-MM-DD, para comparar fechas sin depender de la hora. */
function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

const aFecha = (fecha: string | undefined) => (fecha ? new Date(`${fecha}T00:00:00Z`) : null);

/**
 * POST /prestadores/yo/certificaciones (multipart): los campos del
 * formulario. El archivo va aparte, en el campo «documento».
 *
 * - tipo: el código del catálogo (SEC_INSTALADOR_GAS, OTRA, CURSO…).
 * - identificador: número, folio o código. Obligatorio salvo en un curso.
 * - vigenteHasta: AAAA-MM-DD; si viene, no puede estar vencida. Obligatoria
 *   si el tipo vence (eso lo revisa el servicio, que conoce el catálogo).
 *   Un curso no vence: se descarta.
 * - nombre y emisor: obligatorios con OTRA y con CURSO (ahí el emisor es la
 *   institución); con el resto los pone el catálogo y se descartan.
 * - fechaTermino (obligatoria, no futura) y horas (opcional): solo CURSO.
 */
export const esquemaCertificacion = z
  .object({
    tipo: z.string({ error: "Elige el tipo de certificación." }).trim().min(1, "Elige el tipo de certificación.").max(60),
    identificador: textoOpcional(LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION, LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION, "El número"),
    vigenteHasta: fechaOpcional(),
    nombre: textoOpcional(LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION, "El nombre"),
    emisor: textoOpcional(LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION, "El emisor"),
    fechaTermino: fechaOpcional(),
    horas: z.preprocess(
      vacioComoAusente,
      z.coerce
        .number({ error: "Las horas deben ser un número." })
        .int("Las horas deben ser un número entero.")
        .min(HORAS_MINIMAS_CURSO, `Las horas deben ser al menos ${HORAS_MINIMAS_CURSO}.`)
        .max(HORAS_MAXIMAS_CURSO, `Las horas no pueden superar ${HORAS_MAXIMAS_CURSO}.`)
        .optional(),
    ),
  })
  .superRefine((datos, contexto) => {
    const curso = datos.tipo === CODIGO_CURSO;
    const falta = (campo: string, mensaje: string) => contexto.addIssue({ code: "custom", path: [campo], message: mensaje });

    if (!curso && !datos.identificador) falta("identificador", "Indica el número o folio de la certificación.");
    if (!curso && datos.vigenteHasta && datos.vigenteHasta < hoyEnChile()) {
      falta("vigenteHasta", "Esa certificación ya venció: sube una vigente.");
    }
    if (datos.tipo === CODIGO_CERTIFICACION_OTRA || curso) {
      if (!datos.nombre) falta("nombre", curso ? "Escribe el nombre del curso." : "Escribe el nombre de la certificación.");
      if (!datos.emisor) falta("emisor", curso ? "Escribe la institución que dictó el curso." : "Escribe quién la emite.");
    }
    if (curso) {
      if (!datos.fechaTermino) falta("fechaTermino", "Indica cuándo terminaste el curso.");
      else if (datos.fechaTermino > hoyEnChile()) falta("fechaTermino", "La fecha de término no puede ser futura.");
    }
  })
  // Cada tipo guarda solo lo suyo: el resto se descarta.
  .transform((datos) => {
    const curso = datos.tipo === CODIGO_CURSO;
    const propio = datos.tipo === CODIGO_CERTIFICACION_OTRA || curso;
    return {
      tipo: datos.tipo,
      identificador: datos.identificador ?? null,
      vigenteHasta: curso ? null : aFecha(datos.vigenteHasta),
      nombre: propio ? (datos.nombre ?? null) : null,
      emisor: propio ? (datos.emisor ?? null) : null,
      fechaTermino: curso ? aFecha(datos.fechaTermino) : null,
      horas: curso ? (datos.horas ?? null) : null,
    };
  });

export type DatosCertificacion = z.infer<typeof esquemaCertificacion>;

/** GET /admin/certificaciones?estado=PENDIENTE&pagina=1&porPagina=10 */
export const esquemaColaCertificaciones = z.object({
  estado: z.enum(EstadoCredencial, { error: "Estado no válido." }).default(EstadoCredencial.PENDIENTE),
  pagina: z.coerce.number().int("La página debe ser un número entero.").min(1, "La página parte en 1.").default(1),
  porPagina: z.coerce
    .number()
    .int("porPagina debe ser un número entero.")
    .min(1, "porPagina debe ser al menos 1.")
    .max(50, "porPagina no puede superar 50.")
    .default(10),
});

export const esquemaIdCertificacion = z.object({ id: z.string().min(1).max(64) });

export const esquemaRechazoCertificacion = z.object({
  motivo: z
    .string({ error: "Indica el motivo del rechazo." })
    .trim()
    .min(
      LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION,
      `Explica el motivo en al menos ${LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION} caracteres, para que el prestador sepa qué corregir.`,
    )
    .max(LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION, `El motivo no puede superar los ${LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION} caracteres.`),
});
