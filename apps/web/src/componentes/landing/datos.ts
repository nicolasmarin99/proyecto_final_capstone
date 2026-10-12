import type { NombreIcono } from "../iconos";

/**
 * Contenido de la landing separado del marcado. Agregar una categoría o
 * cambiar un paso es editar este archivo, no copiar y pegar una tarjeta.
 *
 * Cuando exista la tabla de categorías en la API, CATEGORIAS vendrá de ahí;
 * los componentes no tendrán que cambiar porque ya reciben datos.
 */

export interface Categoria {
  /** El mismo slug que la tabla categorias: el enlace filtra por categoría. */
  slug: string;
  nombre: string;
  descripcion: string;
  icono: NombreIcono;
}

/**
 * Seis categorías: la sección de scroll las muestra de a tres, así que el
 * largo tiene que ser múltiplo de 3 (ver GRUPOS_CATEGORIAS).
 */
export const CATEGORIAS: Categoria[] = [
  { slug: "gasfiteria", nombre: "Gasfitería", descripcion: "Filtraciones, calefont, grifería y destapes.", icono: "gota" },
  { slug: "electricidad", nombre: "Electricidad", descripcion: "Instalaciones, enchufes, tableros y luminarias.", icono: "rayo" },
  { slug: "banqueteria", nombre: "Banquetería", descripcion: "Cócteles, cumpleaños, matrimonios y eventos.", icono: "bandeja" },
  { slug: "soldadura", nombre: "Soldadura", descripcion: "Rejas, portones, estructuras y reparaciones.", icono: "llama" },
  { slug: "carpinteria", nombre: "Carpintería", descripcion: "Muebles a medida, puertas y terminaciones.", icono: "martillo" },
  { slug: "cerrajeria", nombre: "Cerrajería", descripcion: "Aperturas, cambio de chapas y copias.", icono: "llave" },
];

export const GRUPOS_CATEGORIAS: Categoria[][] = [CATEGORIAS.slice(0, 3), CATEGORIAS.slice(3, 6)];

/** Atajos bajo el buscador: llevan a /buscar filtrado por esa categoría. */
export const POPULARES = CATEGORIAS.filter((categoria) =>
  ["gasfiteria", "electricidad", "banqueteria", "carpinteria"].includes(categoria.slug),
);

export const PASOS = [
  {
    titulo: "Busca",
    texto: "Escribe lo que necesitas y tu comuna. Te mostramos prestadores que atienden en tu zona.",
  },
  {
    titulo: "Compara",
    texto: "Revisa perfiles, certificados y comentarios de otros clientes para elegir con confianza.",
  },
  {
    titulo: "Contacta",
    texto: "Escríbele directamente al prestador, coordina el trabajo y deja tu reseña al terminar.",
  },
];

export const BENEFICIOS_PRESTADOR: { titulo: string; texto: string; icono: NombreIcono }[] = [
  {
    titulo: "Perfil profesional",
    texto: "Describe tu oficio, zonas de atención y horarios.",
    icono: "persona",
  },
  {
    titulo: "Certificados verificados",
    texto: "Sube tus certificaciones (por ejemplo, SEC) y gana la confianza de los clientes.",
    icono: "escudo",
  },
  {
    titulo: "Reseñas de clientes",
    texto: "Cada trabajo terminado suma comentarios que respaldan tu reputación.",
    icono: "mensaje",
  },
];

/** Dirección de búsqueda para un servicio. La usan el buscador, los chips y las tarjetas. */
