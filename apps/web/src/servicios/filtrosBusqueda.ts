import { LARGO_MAXIMO_CONSULTA, ORDENES_BUSQUEDA, type OrdenBusqueda } from "@localcl/shared";
import { parametrosBusqueda, type FiltrosBusqueda } from "../api/cliente";

/**
 * Los filtros de la búsqueda viven en la URL de /buscar, con los mismos
 * nombres que GET /servicios: ?q=gasfiter&categoria=gasfiteria&comuna=13101
 * &precioMax=50000&orden=precio&pagina=2. Así una búsqueda se puede
 * compartir, recargar, y el botón atrás vuelve a la anterior.
 */

function entero(valor: string | null, minimo: number): number | undefined {
  if (valor === null || !/^\d+$/.test(valor)) return undefined;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero >= minimo ? numero : undefined;
}

function esOrden(valor: string | null): valor is OrdenBusqueda {
  return ORDENES_BUSQUEDA.some((orden) => orden === valor);
}

/**
 * Lee los filtros de la URL. Un valor mal formado (una comuna «abc», un
 * orden inventado) se ignora en vez de romper la página: la URL la puede
 * escribir cualquiera.
 */
export function leerFiltros(parametros: URLSearchParams): FiltrosBusqueda {
  const filtros: FiltrosBusqueda = {};
  const q = parametros.get("q")?.trim().slice(0, LARGO_MAXIMO_CONSULTA);
  const categoria = parametros.get("categoria");
  const comuna = entero(parametros.get("comuna"), 1);
  const precioMax = entero(parametros.get("precioMax"), 0);
  const orden = parametros.get("orden");
  const pagina = entero(parametros.get("pagina"), 1);

  if (q) filtros.q = q;
  if (categoria && /^[a-z0-9-]+$/.test(categoria)) filtros.categoria = categoria;
  if (comuna !== undefined) filtros.comuna = comuna;
  if (precioMax !== undefined) filtros.precioMax = precioMax;
  if (esOrden(orden)) filtros.orden = orden;
  if (pagina !== undefined) filtros.pagina = pagina;

  return filtros;
}

/** La dirección de /buscar para esos filtros. */
export function rutaBuscar(filtros: FiltrosBusqueda): string {
  const consulta = parametrosBusqueda(filtros).toString();
  return consulta ? `/buscar?${consulta}` : "/buscar";
}

/**
 * Los mismos filtros sin uno de ellos, y de vuelta en la primera página: al
 * ampliar la búsqueda, la página 3 de antes ya no significa nada.
 */
export function sinFiltro(filtros: FiltrosBusqueda, clave: "q" | "categoria" | "comuna" | "precioMax"): FiltrosBusqueda {
  const copia = { ...filtros };
  delete copia[clave];
  delete copia.pagina;
  return copia;
}

/** Hay algo que acote la búsqueda (el orden y la página no cuentan). */
export function hayFiltros(filtros: FiltrosBusqueda): boolean {
  return Boolean(filtros.q || filtros.categoria || filtros.comuna !== undefined || filtros.precioMax !== undefined);
}

/** Compara nombres de comuna sin tildes ni mayúsculas: «nunoa» es «Ñuñoa». */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
