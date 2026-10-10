import { listarComunas } from "./territorio.repository.js";

/**
 * Comparador del español: pone la Ñ entre la N y la O, y ordena las vocales
 * con tilde junto a las sin tilde. Ordenar por código de carácter mandaría
 * "Ñuñoa" y cualquier nombre que empiece con "Á" detrás de "Zapallar".
 */
const ordenEspanol = new Intl.Collator("es");

export async function obtenerComunas() {
  const comunas = await listarComunas();

  return comunas.sort((a, b) => ordenEspanol.compare(a.nombre, b.nombre));
}
