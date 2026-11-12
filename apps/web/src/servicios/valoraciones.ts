import type { MotivoObjecion } from "@localcl/shared";
import type { ResumenCorto } from "../api/cliente";

/** Cómo se muestra cada motivo de objeción, con una ayuda corta para elegir bien. */
export const MOTIVO_OBJECION: Record<MotivoObjecion, { texto: string; ayuda: string }> = {
  LENGUAJE_OFENSIVO: { texto: "Lenguaje ofensivo", ayuda: "Insultos, groserías o descalificaciones personales." },
  INFORMACION_FALSA: { texto: "Información falsa", ayuda: "Afirma hechos que no ocurrieron." },
  DATOS_PERSONALES_EXPUESTOS: { texto: "Datos personales expuestos", ayuda: "Muestra una dirección, un teléfono u otros datos de alguien." },
  NO_CORRESPONDE_A_UN_SERVICIO: { texto: "No corresponde a un servicio", ayuda: "Habla de algo que no fue un trabajo tuyo." },
  OTRO: { texto: "Otro", ayuda: "Explica el problema en el comentario." },
};

const unDecimal = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 4.3 → «4,3». */
export function formatearPromedio(promedio: number): string {
  return unDecimal.format(promedio);
}

export function textoCantidad(cantidad: number): string {
  return cantidad === 1 ? "1 valoración" : `${cantidad} valoraciones`;
}

/**
 * El resumen en una frase, para lectores de pantalla y para mostrar:
 * - sin valoraciones: «Aún sin valoraciones» (nunca un cero);
 * - con menos de 3: solo el conteo, «2 valoraciones» (nunca el promedio de una o dos);
 * - con 3 o más: «4,3 de 5 · 12 valoraciones».
 * La API ya decide si hay promedio; aquí solo se respeta.
 */
export function textoResumen({ cantidad, promedio }: ResumenCorto): string {
  if (cantidad === 0) return "Aún sin valoraciones";
  if (promedio === null) return textoCantidad(cantidad);
  return `${formatearPromedio(promedio)} de 5 · ${textoCantidad(cantidad)}`;
}

/** «Juan» → «J», para el avatar cuando no hay foto. */
export function inicial(nombre: string): string {
  return nombre.trim().charAt(0).toUpperCase() || "?";
}
