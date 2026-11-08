import {
  CODIGO_CERTIFICACION_OTRA,
  LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MAXIMO_MOTIVO_RECHAZO_CERTIFICACION,
  LARGO_MAXIMO_NOMBRE_CERTIFICACION,
  LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION,
  LARGO_MINIMO_MOTIVO_RECHAZO_CERTIFICACION,
  LARGO_MINIMO_NOMBRE_CERTIFICACION,
} from "@localcl/shared";
import { z } from "zod";
import { EstadoCredencial } from "../../generated/prisma/client.js";

/** Un campo de texto de un formulario multipart: llega como string, y vacío cuenta como ausente. */
function textoOpcional(minimo: number, maximo: number, nombre: string) {
  return z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
    z
      .string({ error: `${nombre} debe ser texto.` })
      .trim()
      .min(minimo, `${nombre} debe tener al menos ${minimo} caracteres.`)
      .max(maximo, `${nombre} no puede superar los ${maximo} caracteres.`)
      .optional(),
  );
}

/** Hoy en Chile, como fecha AAAA-MM-DD, para comparar vigencias sin depender de la hora. */
function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

/**
 * POST /prestadores/yo/certificaciones (multipart): los campos del
 * formulario. El archivo va aparte, en el campo «documento».
 *
 * - tipo: el código del catálogo (SEC_INSTALADOR_GAS, CHILEVALORA, OTRA…).
 * - identificador: número de registro, folio o código del certificado.
 * - vigenteHasta: AAAA-MM-DD; obligatoria si el tipo la exige (eso lo
 *   revisa el servicio, que conoce el catálogo). Si viene, no puede estar
 *   vencida.
 * - nombre y emisor: solo con OTRA, y ahí obligatorios.
 */
export const esquemaCertificacion = z
  .object({
    tipo: z.string({ error: "Elige el tipo de certificación." }).trim().min(1, "Elige el tipo de certificación.").max(60),
    identificador: z
      .string({ error: "Indica el número o folio de la certificación." })
      .trim()
      .min(LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION, `El número debe tener al menos ${LARGO_MINIMO_IDENTIFICADOR_CERTIFICACION} caracteres.`)
      .max(LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION, `El número no puede superar los ${LARGO_MAXIMO_IDENTIFICADOR_CERTIFICACION} caracteres.`),
    vigenteHasta: z.preprocess(
      (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha como AAAA-MM-DD.")
        .refine((fecha) => !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`)), "Esa fecha no existe.")
        .optional(),
    ),
    nombre: textoOpcional(LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION, "El nombre"),
    emisor: textoOpcional(LARGO_MINIMO_NOMBRE_CERTIFICACION, LARGO_MAXIMO_NOMBRE_CERTIFICACION, "El emisor"),
  })
  .superRefine((datos, contexto) => {
    if (datos.vigenteHasta && datos.vigenteHasta < hoyEnChile()) {
      contexto.addIssue({ code: "custom", path: ["vigenteHasta"], message: "Esa certificación ya venció: sube una vigente." });
    }
    if (datos.tipo === CODIGO_CERTIFICACION_OTRA) {
      if (!datos.nombre) contexto.addIssue({ code: "custom", path: ["nombre"], message: "Escribe el nombre de la certificación." });
      if (!datos.emisor) contexto.addIssue({ code: "custom", path: ["emisor"], message: "Escribe quién la emite." });
    }
  })
  // Con cualquier tipo del catálogo, nombre y emisor los pone el catálogo: se descartan.
  .transform((datos) => ({
    tipo: datos.tipo,
    identificador: datos.identificador,
    vigenteHasta: datos.vigenteHasta ? new Date(`${datos.vigenteHasta}T00:00:00Z`) : null,
    nombre: datos.tipo === CODIGO_CERTIFICACION_OTRA ? (datos.nombre ?? null) : null,
    emisor: datos.tipo === CODIGO_CERTIFICACION_OTRA ? (datos.emisor ?? null) : null,
  }));

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
