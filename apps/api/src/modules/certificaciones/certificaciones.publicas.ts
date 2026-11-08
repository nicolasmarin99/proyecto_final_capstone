import { prisma } from "../../db.js";
import { Prisma } from "../../generated/prisma/client.js";

/*
  ÚNICA definición de «certificación que el público puede ver».

  Una certificación cuenta si y solo si:
  - un administrador la aprobó (estado VERIFICADA);
  - no venció (sin fecha de vigencia, o vigente hasta hoy inclusive);
  - no es la cédula de identidad (tipo IDENTIDAD): verificar quién eres es
    requisito para publicar, no una certificación de oficio.

  La usan el buscador (sello «Prestador con certificaciones» en la tarjeta),
  la página del servicio y el perfil público del prestador. Es SQL por la
  misma razón que la regla de visibilidad (servicios.visibilidad.ts): el
  buscador es una consulta $queryRaw.

  Lo que sale de una certificación pública es su nombre, quién la emite, la
  fecha en que se verificó y su vigencia. Nunca el documento ni su número.
*/

/** Condición SQL, para incrustar en $queryRaw. Supone la tabla credenciales con el alias `cr`. */
export const condicionCertificacionPublica = Prisma.sql`(
  cr.estado = 'VERIFICADA'
  AND (cr.vigente_hasta IS NULL OR cr.vigente_hasta >= CURRENT_DATE)
  AND cr.tipo_id <> (SELECT id FROM tipos_credencial WHERE codigo = 'IDENTIDAD')
)`;

/** ¿El prestador tiene alguna certificación pública? Para usar dentro de otra consulta (alias de perfil `p`). */
export const prestadorConCertificaciones = Prisma.sql`EXISTS (
  SELECT 1 FROM credenciales cr WHERE cr.prestador_id = p.id AND ${condicionCertificacionPublica}
)`;

export interface CertificacionPublica {
  nombre: string;
  emisor: string;
  verificadaEn: Date | null;
  vigenteHasta: Date | null;
  /** Contrastada con el registro del organismo, o revisada a mano por LocalCL. */
  acreditacion: "REGISTRO_OFICIAL" | "REVISADA_POR_LOCALCL";
}

/** Las certificaciones públicas de un prestador, las más recientes primero. */
export async function certificacionesPublicasDe(prestadorId: string): Promise<CertificacionPublica[]> {
  const filas = await prisma.$queryRaw<
    { nombre: string; emisor: string; verificadaEn: Date | null; vigenteHasta: Date | null; metodo: string | null }[]
  >`
    SELECT
      coalesce(cr.nombre_personalizado, t.nombre)      AS nombre,
      coalesce(cr.emisor_personalizado, t.fuente_oficial) AS emisor,
      cr.fecha_consulta                                AS "verificadaEn",
      cr.vigente_hasta                                 AS "vigenteHasta",
      cr.metodo::text                                  AS metodo
    FROM credenciales cr
    JOIN tipos_credencial t ON t.id = cr.tipo_id
    WHERE cr.prestador_id = ${prestadorId} AND ${condicionCertificacionPublica}
    ORDER BY cr.fecha_consulta DESC NULLS LAST, cr.id`;

  return filas.map((fila) => ({
    nombre: fila.nombre,
    emisor: fila.emisor,
    verificadaEn: fila.verificadaEn,
    vigenteHasta: fila.vigenteHasta,
    acreditacion: fila.metodo === "AUTOMATICO" ? "REGISTRO_OFICIAL" : "REVISADA_POR_LOCALCL",
  }));
}

