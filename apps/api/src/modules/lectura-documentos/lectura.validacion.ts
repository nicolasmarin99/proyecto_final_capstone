import { normalizarRut } from "@localcl/shared";
import type { CampoExtraido } from "./lectura.tipos.js";

/*
  VALIDACIÓN CRUZADA: lo que se leyó del documento contra lo que el
  prestador declaró en su cuenta.

  Si el RUT o el nombre no coinciden, se genera una ALERTA que el
  administrador ve destacada antes de decidir. La alerta NO bloquea ni
  rechaza nada: un documento mal escaneado puede leerse mal y dar un falso
  positivo, y quien decide es la persona que mira el documento.

  Se calcula al mostrar la extracción, con los datos actuales de la cuenta:
  no se guarda.
*/

export interface AlertaLectura {
  campo: "rut" | "nombre";
  mensaje: string;
  /** Lo que declaró el prestador en su cuenta. */
  declarado: string;
  /** Lo que se leyó del documento. */
  leido: string;
}

/** Palabras que no distinguen a una persona de otra. */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);

/** «María José de la Fuente» → ["maria", "jose", "fuente"]. */
function palabrasDelNombre(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-zñ]+/)
    .filter((palabra) => palabra.length >= 2 && !PARTICULAS.has(palabra));
}

/**
 * ¿Los dos nombres pueden ser de la misma persona? Sí, si todas las
 * palabras del más corto están en el más largo, en cualquier orden: la
 * cuenta suele decir «Pedro Soto» y la cédula «SOTO PÉREZ PEDRO ANTONIO».
 * Una sola palabra distinta («Juan Soto») ya es una diferencia significativa.
 */
export function nombresCompatibles(declarado: string, leido: string): boolean {
  const a = palabrasDelNombre(declarado);
  const b = palabrasDelNombre(leido);
  if (a.length === 0 || b.length === 0) return false;
  const [corto, largo] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return corto.every((palabra) => largo.has(palabra));
}

/** Las alertas de una extracción frente a lo declarado en la cuenta. */
export function alertasDe(campos: readonly CampoExtraido[], declarado: { nombre: string; rut: string | null }): AlertaLectura[] {
  const alertas: AlertaLectura[] = [];
  const rut = campos.find((campo) => campo.campo === "rut");
  const nombre = campos.find((campo) => campo.campo === "nombre");

  if (rut && declarado.rut && normalizarRut(rut.valor) !== normalizarRut(declarado.rut)) {
    alertas.push({
      campo: "rut",
      mensaje: "El RUT leído del documento NO coincide con el RUT de la cuenta.",
      declarado: declarado.rut,
      leido: rut.valor,
    });
  }

  if (nombre && !nombresCompatibles(declarado.nombre, nombre.valor)) {
    alertas.push({
      campo: "nombre",
      mensaje: "El nombre leído del documento difiere del nombre de la cuenta.",
      declarado: declarado.nombre,
      leido: nombre.valor,
    });
  }

  return alertas;
}
