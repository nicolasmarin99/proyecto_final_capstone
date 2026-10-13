import type { MotivoReporte } from "@localcl/shared";

/** Cómo se muestra cada motivo, con una ayuda corta para elegir bien. */
export const MOTIVO_REPORTE: Record<MotivoReporte, { texto: string; ayuda: string }> = {
  CONTENIDO_ENGANOSO: { texto: "Contenido engañoso", ayuda: "Promete algo que no ofrece, o los precios no son reales." },
  IMAGENES_INAPROPIADAS: { texto: "Imágenes inapropiadas", ayuda: "Fotos ofensivas, ajenas o que muestran datos de terceros." },
  DATOS_DE_CONTACTO_EN_LA_DESCRIPCION: {
    texto: "Datos de contacto en la descripción",
    ayuda: "Teléfonos, correos o enlaces escritos en el texto.",
  },
  SERVICIO_ILEGAL_O_PELIGROSO: { texto: "Servicio ilegal o peligroso", ayuda: "Algo prohibido o que pone en riesgo a las personas." },
  SUPLANTACION_DE_IDENTIDAD: { texto: "Suplantación de identidad", ayuda: "Se hace pasar por otra persona o empresa." },
  OTRO: { texto: "Otro", ayuda: "Cuéntanos qué pasa en el comentario." },
};

/** «hace 5 minutos», «hace 3 horas», «hace 2 días». */
export function textoEspera(minutos: number): string {
  if (minutos < 60) return minutos <= 1 ? "hace un momento" : `hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
