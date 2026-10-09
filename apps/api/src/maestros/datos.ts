import type { MetodoVerificacion } from "../generated/prisma/client.js";

/*
  Datos maestros: catálogos que el sistema necesita para funcionar en
  cualquier entorno, producción incluida. Aquí no hay usuarios ni datos de
  prueba; esos viven en prisma/seed.ts.

  Regiones y comunas usan como clave el Código Único Territorial (CUT) de la
  Subsecretaría de Desarrollo Regional: es oficial, estable y es el mismo
  que usan los registros públicos.
*/

export const REGIONES: { id: number; nombre: string; orden: number }[] = [
  // orden: de norte a sur, que no coincide con el código (las regiones
  // nuevas recibieron los números 14, 15 y 16).
  { id: 15, nombre: "Arica y Parinacota", orden: 1 },
  { id: 1, nombre: "Tarapacá", orden: 2 },
  { id: 2, nombre: "Antofagasta", orden: 3 },
  { id: 3, nombre: "Atacama", orden: 4 },
  { id: 4, nombre: "Coquimbo", orden: 5 },
  { id: 5, nombre: "Valparaíso", orden: 6 },
  { id: 13, nombre: "Metropolitana de Santiago", orden: 7 },
  { id: 6, nombre: "Libertador General Bernardo O'Higgins", orden: 8 },
  { id: 7, nombre: "Maule", orden: 9 },
  { id: 16, nombre: "Ñuble", orden: 10 },
  { id: 8, nombre: "Biobío", orden: 11 },
  { id: 9, nombre: "La Araucanía", orden: 12 },
  { id: 14, nombre: "Los Ríos", orden: 13 },
  { id: 10, nombre: "Los Lagos", orden: 14 },
  { id: 11, nombre: "Aysén del General Carlos Ibáñez del Campo", orden: 15 },
  { id: 12, nombre: "Magallanes y de la Antártica Chilena", orden: 16 },
];

const REGION_METROPOLITANA = 13;

/** Las 52 comunas de la Región Metropolitana, agrupadas por provincia. */
export const COMUNAS_RM: { id: number; nombre: string; regionId: number }[] = [
  // Provincia de Santiago
  [13101, "Santiago"],
  [13102, "Cerrillos"],
  [13103, "Cerro Navia"],
  [13104, "Conchalí"],
  [13105, "El Bosque"],
  [13106, "Estación Central"],
  [13107, "Huechuraba"],
  [13108, "Independencia"],
  [13109, "La Cisterna"],
  [13110, "La Florida"],
  [13111, "La Granja"],
  [13112, "La Pintana"],
  [13113, "La Reina"],
  [13114, "Las Condes"],
  [13115, "Lo Barnechea"],
  [13116, "Lo Espejo"],
  [13117, "Lo Prado"],
  [13118, "Macul"],
  [13119, "Maipú"],
  [13120, "Ñuñoa"],
  [13121, "Pedro Aguirre Cerda"],
  [13122, "Peñalolén"],
  [13123, "Providencia"],
  [13124, "Pudahuel"],
  [13125, "Quilicura"],
  [13126, "Quinta Normal"],
  [13127, "Recoleta"],
  [13128, "Renca"],
  [13129, "San Joaquín"],
  [13130, "San Miguel"],
  [13131, "San Ramón"],
  [13132, "Vitacura"],
  // Provincia Cordillera
  [13201, "Puente Alto"],
  [13202, "Pirque"],
  [13203, "San José de Maipo"],
  // Provincia de Chacabuco
  [13301, "Colina"],
  [13302, "Lampa"],
  [13303, "Tiltil"],
  // Provincia de Maipo
  [13401, "San Bernardo"],
  [13402, "Buin"],
  [13403, "Calera de Tango"],
  [13404, "Paine"],
  // Provincia de Melipilla
  [13501, "Melipilla"],
  [13502, "Alhué"],
  [13503, "Curacaví"],
  [13504, "María Pinto"],
  [13505, "San Pedro"],
  // Provincia de Talagante
  [13601, "Talagante"],
  [13602, "El Monte"],
  [13603, "Isla de Maipo"],
  [13604, "Padre Hurtado"],
  [13605, "Peñaflor"],
].map(([id, nombre]) => ({ id: Number(id), nombre: String(nombre), regionId: REGION_METROPOLITANA }));

/** Las mismas seis que muestra la landing, en el mismo orden. */
export const CATEGORIAS: { slug: string; nombre: string; orden: number }[] = [
  { slug: "gasfiteria", nombre: "Gasfitería", orden: 1 },
  { slug: "electricidad", nombre: "Electricidad", orden: 2 },
  { slug: "banqueteria", nombre: "Banquetería", orden: 3 },
  { slug: "soldadura", nombre: "Soldadura", orden: 4 },
  { slug: "carpinteria", nombre: "Carpintería", orden: 5 },
  { slug: "cerrajeria", nombre: "Cerrajería", orden: 6 },
];

export const TIPOS_CREDENCIAL: {
  codigo: string;
  nombre: string;
  fuenteOficial: string;
  metodoVerificacion: MetodoVerificacion;
  requiereVigencia: boolean;
}[] = [
  {
    codigo: "SEC_INSTALADOR_ELECTRICO",
    nombre: "Instalador eléctrico autorizado (SEC)",
    fuenteOficial: "Superintendencia de Electricidad y Combustibles",
    metodoVerificacion: "AUTOMATICO",
    requiereVigencia: true,
  },
  {
    codigo: "SEC_INSTALADOR_GAS",
    nombre: "Instalador de gas autorizado (SEC)",
    fuenteOficial: "Superintendencia de Electricidad y Combustibles",
    metodoVerificacion: "AUTOMATICO",
    requiereVigencia: true,
  },
  {
    codigo: "CHILEVALORA",
    nombre: "Certificación de competencias laborales",
    fuenteOficial: "ChileValora",
    metodoVerificacion: "MANUAL",
    requiereVigencia: true,
  },
  {
    codigo: "RESOLUCION_SANITARIA",
    nombre: "Resolución sanitaria para manipulación de alimentos",
    fuenteOficial: "SEREMI de Salud",
    metodoVerificacion: "MANUAL",
    requiereVigencia: true,
  },
  {
    codigo: "INICIO_ACTIVIDADES_SII",
    nombre: "Inicio de actividades",
    fuenteOficial: "Servicio de Impuestos Internos",
    metodoVerificacion: "MANUAL",
    requiereVigencia: false,
  },
];

/**
 * Primera versión de los términos. Una versión publicada no se modifica:
 * cambiarlos es agregar otra con un identificador nuevo.
 */
export const TERMINOS_INICIALES = {
  version: "2026-10",
  vigenteDesde: new Date("2026-10-09T00:00:00-03:00"),
  contenido: [
    "Términos y condiciones de LocalCL — versión 2026-10",
    "",
    "1. LocalCL es una plataforma que conecta a personas que buscan servicios con prestadores de la Región Metropolitana. LocalCL no presta los servicios ni es parte del acuerdo entre cliente y prestador.",
    "2. Las credenciales que muestra un perfil se contrastan con la fuente oficial indicada en cada una. Una credencial verificada acredita lo que la fuente informaba en la fecha de consulta, no la calidad de un trabajo particular.",
    "3. Solo puede valorar a un prestador quien lo contactó desde la plataforma, y una sola vez. Las valoraciones deben referirse a la experiencia propia; las que infrinjan estas reglas pueden ocultarse tras una denuncia.",
    "4. Puedes pedir la eliminación de tu cuenta. Si tiene historial (contactos, valoraciones o credenciales), se anonimiza: se borran tus datos personales y lo demás queda sin identificarte.",
    "5. Tratamos tus datos personales conforme a la Ley N° 19.628 sobre protección de la vida privada.",
  ].join("\n"),
};
