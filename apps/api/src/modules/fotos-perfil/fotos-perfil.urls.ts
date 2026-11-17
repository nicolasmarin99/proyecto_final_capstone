import { obtenerAlmacenamientoPerfiles } from "../almacenamiento/index.js";

/*
  Cómo sale una foto de perfil en las respuestas. Aparte del servicio de
  fotos porque también la usan el perfil público, la página de un servicio
  y las valoraciones, y así ninguno de esos servicios depende de este.
*/

export interface FotoPublica {
  /** Para reportarla. Nunca el identificador del archivo. */
  id: string;
  url: string;
  miniatura: string;
}

/** La foto vigente de una cuenta tal como la ve cualquiera, o null si no tiene. */
export function fotoPublica(fotos: readonly { id: string; identificador: string }[] | null | undefined): FotoPublica | null {
  const [foto] = fotos ?? [];
  if (!foto) return null;
  const almacenamiento = obtenerAlmacenamientoPerfiles();
  return { id: foto.id, url: almacenamiento.url(foto.identificador, "completa"), miniatura: almacenamiento.url(foto.identificador, "miniatura") };
}
