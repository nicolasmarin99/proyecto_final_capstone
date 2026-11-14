/**
 * Datos de demostración para la búsqueda: prestadores verificados en
 * distintas comunas de la RM, con servicios de varias categorías y precios.
 *
 * Solo para desarrollo local (npm run seed:demo --workspace=@localcl/api).
 * Es idempotente: se puede correr varias veces y deja siempre lo mismo.
 * Incluye a propósito un servicio pausado y uno de un prestador sin
 * identidad verificada, que la búsqueda nunca debe mostrar.
 *
 * Todas las cuentas usan la contraseña de las cuentas de prueba del seed.
 *
 * Fotos: si en prisma/demo-imagenes/ hay archivos que empiezan con la clave
 * `fotos` de un servicio (por ejemplo gasfiteria-1.jpg, gasfiteria-2.jpg),
 * se suben a ese servicio en orden alfabético, hasta 5. Pasan por la misma
 * limpieza de metadatos que una subida desde la web y van al almacenamiento
 * público configurado (disco en desarrollo, Cloudinary en producción). Se
 * puede indicar otra carpeta como primer argumento.
 */
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAXIMO_IMAGENES_SERVICIO } from "@localcl/shared";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/db.js";
import type { MotivoDenuncia, UnidadPrecio } from "../src/generated/prisma/client.js";
import { obtenerAlmacenamientoPublico } from "../src/modules/almacenamiento/index.js";
import { detectarTipoImagen, quitarMetadatosImagen } from "../src/modules/imagenes/imagenes.archivo.js";
import { regenerarEmbeddings } from "../src/modules/servicios/servicios.indexacion.js";

const CARPETA_FOTOS = path.resolve(process.argv[2] ?? fileURLToPath(new URL("./demo-imagenes/", import.meta.url)));

const CONTRASENA = "Local.2026!";
const REGION_METROPOLITANA = 13;

/** Dígito verificador de un RUT (módulo 11). */
function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const digito of String(cuerpo).split("").reverse()) {
    suma += Number(digito) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

interface ServicioDemo {
  titulo: string;
  descripcion: string;
  categoria: string;
  categoriaPersonalizada?: string;
  precioDesde: number | null;
  precioHasta?: number;
  unidad?: UnidadPrecio;
  estado?: "PUBLICADO" | "PAUSADO";
  /** Días atrás en que se publicó, para que «más recientes» tenga sentido. */
  haceDias: number;
  /** Prefijo de sus fotos en la carpeta de demostración. */
  fotos?: string;
}

interface PrestadorDemo {
  correo: string;
  nombre: string;
  rut: number;
  telefono: string;
  identidad: boolean;
  /** Código de un tipo de credencial verificado contra el registro oficial. */
  credencialOficial?: string;
  /**
   * «Otra certificación» aprobada a mano por el administrador de prueba. Las
   * pendientes no se siembran: su documento vive en el almacenamiento de la
   * API, y en desarrollo ese almacenamiento está en memoria.
   */
  certificacionRevisada?: { nombre: string; emisor: string; identificador: string };
  /** Curso aprobado a mano: se muestra en «Cursos» y no enciende el sello. */
  cursoRevisado?: { nombre: string; institucion: string; fechaTermino: string; horas: number | null };
  comunaBase: string;
  comunas: string[];
  descripcion: string;
  servicios: ServicioDemo[];
}

const PRESTADORES: PrestadorDemo[] = [
  {
    correo: "demo.pedro@localcl.cl",
    nombre: "Pedro Soto",
    rut: 15234871,
    telefono: "+56911112222",
    identidad: true,
    credencialOficial: "SEC_INSTALADOR_GAS",
    comunaBase: "Ñuñoa",
    comunas: ["Ñuñoa", "Providencia", "Santiago", "Las Condes", "La Reina"],
    descripcion: "Gasfíter con 12 años de experiencia en calefont, filtraciones y redes de gas.",
    servicios: [
      {
        titulo: "Gasfitería a domicilio",
        descripcion: "Reparación de filtraciones, cambio de llaves y grifería, destapes. Visita sin costo en Ñuñoa.",
        categoria: "gasfiteria",
        precioDesde: 25000,
        precioHasta: 60000,
        unidad: "POR_SERVICIO",
        haceDias: 2,
        fotos: "gasfiteria",
      },
      {
        titulo: "Mantención e instalación de calefont",
        descripcion: "Limpieza, cambio de membrana y revisión de gases. Instalador autorizado SEC.",
        categoria: "gasfiteria",
        precioDesde: 35000,
        unidad: "POR_SERVICIO",
        haceDias: 10,
        fotos: "calefont",
      },
      {
        titulo: "Destape de cañerías y alcantarillado",
        descripcion: "Destape con máquina eléctrica de lavaplatos, baños y cámaras. Atención el mismo día.",
        categoria: "gasfiteria",
        precioDesde: null,
        haceDias: 20,
      },
      {
        titulo: "Gasfitería nocturna de emergencia",
        descripcion: "Servicio pausado por vacaciones: no debe aparecer en la búsqueda.",
        categoria: "gasfiteria",
        precioDesde: 45000,
        unidad: "POR_SERVICIO",
        estado: "PAUSADO",
        haceDias: 1,
      },
    ],
  },
  {
    correo: "demo.carolina@localcl.cl",
    nombre: "Carolina Muñoz",
    rut: 17845220,
    telefono: "+56922223333",
    identidad: true,
    credencialOficial: "SEC_INSTALADOR_ELECTRICO",
    comunaBase: "Maipú",
    comunas: ["Maipú", "Cerrillos", "Estación Central", "Pudahuel"],
    descripcion: "Electricista autorizada SEC. Instalaciones domiciliarias y regularizaciones.",
    servicios: [
      {
        titulo: "Instalación de enchufes y luminarias",
        descripcion: "Enchufes, interruptores, lámparas y focos LED. Trabajo limpio y garantizado.",
        categoria: "electricidad",
        precioDesde: 15000,
        unidad: "POR_HORA",
        haceDias: 3,
        fotos: "electricidad",
      },
      {
        titulo: "Tableros eléctricos y certificación TE1",
        descripcion: "Cambio de tableros, diferenciales y automáticos. Tramitación de certificado ante la SEC.",
        categoria: "electricidad",
        precioDesde: 80000,
        precioHasta: 150000,
        unidad: "POR_SERVICIO",
        haceDias: 15,
      },
      {
        // Búsqueda por significado: «se cortó la luz en la mitad de la casa».
        titulo: "Reparación de cortocircuitos y fallas eléctricas",
        descripcion: "Diagnóstico de enchufes que no funcionan, automáticos que se bajan solos y cortes de luz en parte de la casa.",
        categoria: "electricidad",
        precioDesde: 30000,
        unidad: "POR_SERVICIO",
        haceDias: 6,
      },
    ],
  },
  {
    correo: "demo.jorge@localcl.cl",
    cursoRevisado: { nombre: "Cerrajería y sistemas de seguridad", institucion: "OTEC Capacita Chile", fechaTermino: "2024-08-30", horas: 80 },
    nombre: "Jorge Ramírez",
    rut: 12987654,
    telefono: "+56933334444",
    identidad: true,
    comunaBase: "Puente Alto",
    comunas: ["Puente Alto", "La Florida", "San Bernardo"],
    descripcion: "Maestro carpintero y cerrajero. Muebles a medida y urgencias.",
    servicios: [
      {
        titulo: "Muebles de cocina a medida",
        descripcion: "Diseño, fabricación e instalación de muebles de cocina en melamina y madera.",
        categoria: "carpinteria",
        precioDesde: 300000,
        unidad: "POR_SERVICIO",
        haceDias: 7,
        fotos: "carpinteria",
      },
      {
        titulo: "Reparación de puertas y ventanas",
        descripcion: "Ajuste de bisagras, cepillado de puertas que rozan y cambio de manillas.",
        categoria: "carpinteria",
        precioDesde: 20000,
        unidad: "POR_SERVICIO",
        haceDias: 25,
      },
      {
        titulo: "Cerrajería de urgencia 24 horas",
        descripcion: "Apertura de puertas sin daño, cambio de chapas y copias de llaves.",
        categoria: "cerrajeria",
        precioDesde: 18000,
        unidad: "POR_SERVICIO",
        haceDias: 5,
      },
    ],
  },
  {
    correo: "demo.valentina@localcl.cl",
    nombre: "Valentina Rojas",
    rut: 18456123,
    telefono: "+56944445555",
    identidad: true,
    certificacionRevisada: { nombre: "Técnico en climatización y refrigeración", emisor: "INACAP", identificador: "INACAP-CLIM-2021-118" },
    comunaBase: "Vitacura",
    comunas: ["Vitacura", "Lo Barnechea", "Las Condes", "Providencia"],
    descripcion: "Banquetería para eventos familiares y empresas, y pintura de interiores.",
    servicios: [
      {
        titulo: "Cóctel para eventos y cumpleaños",
        descripcion: "Bocados fríos y calientes, garzones y montaje. Desde 30 personas.",
        categoria: "banqueteria",
        precioDesde: 12000,
        unidad: "POR_PERSONA",
        haceDias: 4,
        fotos: "banqueteria",
      },
      {
        titulo: "Pintura de departamentos y casas",
        descripcion: "Empaste, reparación de grietas y pintura de muros y cielos. Materiales incluidos.",
        categoria: "otros",
        categoriaPersonalizada: "Pintura de interiores",
        precioDesde: 8000,
        unidad: "POR_METRO_CUADRADO",
        haceDias: 12,
        fotos: "pintura",
      },
      {
        // Búsqueda por significado: «hace demasiado calor en la pieza».
        titulo: "Instalación y mantención de aire acondicionado",
        descripcion: "Equipos split para departamentos y oficinas: instalación, limpieza de filtros y recarga de gas refrigerante.",
        categoria: "otros",
        categoriaPersonalizada: "Climatización",
        precioDesde: 45000,
        unidad: "POR_SERVICIO",
        haceDias: 8,
      },
    ],
  },
  {
    correo: "demo.luis@localcl.cl",
    nombre: "Luis Díaz",
    rut: 14567890,
    telefono: "+56955556666",
    identidad: true,
    comunaBase: "Quilicura",
    comunas: ["Quilicura", "Renca", "Huechuraba"],
    descripcion: "Soldador con taller propio. Estructuras metálicas, rejas y portones.",
    servicios: [
      {
        titulo: "Rejas y portones de fierro",
        descripcion: "Fabricación e instalación de rejas, portones corredizos y protecciones.",
        categoria: "soldadura",
        precioDesde: null,
        haceDias: 9,
        fotos: "soldadura",
      },
      {
        titulo: "Cierre de terrazas con estructura metálica",
        descripcion: "Estructuras de fierro para cerrar terrazas, cobertizos y techumbres de policarbonato.",
        categoria: "soldadura",
        precioDesde: 250000,
        unidad: "POR_SERVICIO",
        haceDias: 14,
      },
    ],
  },
  {
    // Oficios fuera de la lista de categorías («Otros»), pensados para la
    // búsqueda por significado: ninguno comparte palabras con frases como
    // «el pasto está muy largo» o «el sillón quedó manchado».
    correo: "demo.ana@localcl.cl",
    nombre: "Ana Contreras",
    rut: 13579246,
    telefono: "+56977778888",
    identidad: true,
    comunaBase: "Macul",
    comunas: ["Macul", "Ñuñoa", "Providencia", "La Reina"],
    descripcion: "Jardinería, limpieza a domicilio y reparación de electrodomésticos, con herramientas propias.",
    servicios: [
      {
        titulo: "Mantención de jardines y poda",
        descripcion: "Corte de pasto, poda de árboles y arbustos, retiro de maleza y programación del riego.",
        categoria: "otros",
        categoriaPersonalizada: "Jardinería",
        precioDesde: 20000,
        unidad: "POR_SERVICIO",
        haceDias: 3,
      },
      {
        titulo: "Limpieza profunda de alfombras y sillones",
        descripcion: "Lavado a domicilio con máquina de inyección y extracción. Quita manchas y olores de tapices.",
        categoria: "otros",
        categoriaPersonalizada: "Limpieza",
        precioDesde: 15000,
        unidad: "POR_SERVICIO",
        haceDias: 11,
      },
      {
        titulo: "Reparación de lavadoras y refrigeradores",
        descripcion: "Diagnóstico a domicilio de lavadoras que no centrifugan, refrigeradores que no enfrían y secadoras.",
        categoria: "otros",
        categoriaPersonalizada: "Reparación de electrodomésticos",
        precioDesde: 25000,
        unidad: "POR_SERVICIO",
        haceDias: 16,
      },
    ],
  },
  {
    correo: "demo.sinverificar@localcl.cl",
    nombre: "Prestador sin verificar",
    rut: 16111222,
    telefono: "+56966667777",
    identidad: false,
    comunaBase: "Santiago",
    comunas: ["Santiago", "Ñuñoa"],
    descripcion: "Su identidad no está verificada: sus servicios no deben aparecer.",
    servicios: [
      {
        titulo: "Gasfitería express sin verificar",
        descripcion: "Figura como publicado, pero la búsqueda no debe mostrarlo nunca.",
        categoria: "gasfiteria",
        precioDesde: 10000,
        unidad: "POR_SERVICIO",
        haceDias: 0,
      },
    ],
  },
];

async function idComuna(nombre: string): Promise<number> {
  const comuna = await prisma.comuna.findFirst({ where: { nombre, regionId: REGION_METROPOLITANA }, select: { id: true } });
  if (!comuna) throw new Error(`No existe la comuna ${nombre}: corre antes npm run seed:maestros.`);
  return comuna.id;
}

async function idCategoria(slug: string): Promise<string> {
  const categoria = await prisma.categoria.findUnique({ where: { slug }, select: { id: true } });
  if (!categoria) throw new Error(`No existe la categoría ${slug}: corre antes npm run seed:maestros.`);
  return categoria.id;
}

/** Archivos de la carpeta de demostración que empiezan con `clave-`, en orden alfabético. */
async function fotosDe(clave: string, disponibles: string[]): Promise<string[]> {
  return disponibles
    .filter((nombre) => nombre.toLowerCase().startsWith(`${clave}-`))
    .sort()
    .slice(0, MAXIMO_IMAGENES_SERVICIO)
    .map((nombre) => path.join(CARPETA_FOTOS, nombre));
}

/** Sube una foto como lo haría la API: tipo por los bytes, sin metadatos, nombre nuevo. */
async function subirFoto(servicioId: string, ruta: string, orden: number): Promise<boolean> {
  const contenido = await readFile(ruta);
  const tipo = detectarTipoImagen(contenido);

  if (!tipo) {
    console.warn(`  ${path.basename(ruta)}: no es JPG, PNG ni WEBP; se omite.`);
    return false;
  }

  const identificador = randomUUID();
  await obtenerAlmacenamientoPublico().guardar({ id: identificador, contenido: quitarMetadatosImagen(contenido, tipo), tipo });
  await prisma.imagenServicio.create({ data: { servicioId, identificador, orden } });
  return true;
}

// ─── Reportes ──────────────────────────────────────────────────────────────

const HORA = 60 * 60 * 1000;

/** Clientes de demostración que reportan. Dos tienen la cuenta recién creada. */
const CLIENTES_DEMO = [
  { correo: "demo.cliente1@localcl.cl", nombre: "Camila Torres", haceDias: 120 },
  { correo: "demo.cliente2@localcl.cl", nombre: "Matías Fuentes", haceDias: 60 },
  { correo: "demo.cliente3@localcl.cl", nombre: "Fernanda Silva", haceDias: 2 },
  { correo: "demo.cliente4@localcl.cl", nombre: "Diego Navarro", haceDias: 1 },
  { correo: "demo.cliente5@localcl.cl", nombre: "Javiera Muñoz", haceDias: 45 },
  { correo: "demo.cliente6@localcl.cl", nombre: "Tomás Reyes", haceDias: 30 },
];

interface ValoracionDemo {
  prestador: string;
  /** Título del servicio valorado: cada valoración califica UN servicio. */
  servicio: string;
  /** Índice en CLIENTES_DEMO. */
  cliente: number;
  calificacion: number;
  comentario: string | null;
  /** Días desde el contacto; la valoración se escribe un día después. */
  haceDias: number;
  /** Si el prestador la objetó (queda pendiente en la cola de reportes). */
  objetada?: { motivo: "LENGUAJE_OFENSIVO" | "INFORMACION_FALSA"; comentario: string | null };
}

/**
 * Valoraciones de demostración, POR SERVICIO, pensadas para mostrar cada caso:
 * - Pedro (general 4,2 con 5):
 *   · «Mantención e instalación de calefont»: 5, 5, 4 → 4,7 con distribución.
 *   · «Gasfitería a domicilio»: 4, 3 → solo el conteo (menos de 3).
 *   · «Destape de cañerías y alcantarillado»: ninguna.
 * - Carolina: «Tableros eléctricos y certificación TE1»: 5, 4, 5 → 4,7, justo
 *   en el mínimo; sus otros servicios, sin valoraciones.
 * - Valentina: «Cóctel para eventos y cumpleaños»: 2 → solo el conteo.
 * - Jorge (general 3,3 con 3): «Cerrajería de urgencia 24 horas»: 4 y 1, y la
 *   de 1 estrella objetada por él → pendiente en la cola; «Muebles de cocina
 *   a medida»: 5.
 * - Luis y Ana: ninguna → «Aún sin valoraciones».
 */
const VALORACIONES_DEMO: ValoracionDemo[] = [
  { prestador: "demo.pedro@localcl.cl", servicio: "Mantención e instalación de calefont", cliente: 0, calificacion: 5, comentario: "Llegó a la hora y dejó el calefont funcionando. Muy ordenado.", haceDias: 40 },
  { prestador: "demo.pedro@localcl.cl", servicio: "Mantención e instalación de calefont", cliente: 1, calificacion: 5, comentario: "Explicó todo antes de cobrar. Lo volvería a llamar.", haceDias: 30 },
  { prestador: "demo.pedro@localcl.cl", servicio: "Mantención e instalación de calefont", cliente: 2, calificacion: 4, comentario: null, haceDias: 20 },
  { prestador: "demo.pedro@localcl.cl", servicio: "Gasfitería a domicilio", cliente: 3, calificacion: 4, comentario: "Buen trabajo, aunque tuvo que volver por una pieza.", haceDias: 12 },
  { prestador: "demo.pedro@localcl.cl", servicio: "Gasfitería a domicilio", cliente: 4, calificacion: 3, comentario: "Cumplió, pero se demoró más de lo acordado.", haceDias: 6 },
  { prestador: "demo.carolina@localcl.cl", servicio: "Tableros eléctricos y certificación TE1", cliente: 0, calificacion: 5, comentario: "Cambió todo el tablero en un día y quedó impecable.", haceDias: 25 },
  { prestador: "demo.carolina@localcl.cl", servicio: "Tableros eléctricos y certificación TE1", cliente: 2, calificacion: 4, comentario: "Muy profesional. El presupuesto fue claro.", haceDias: 15 },
  { prestador: "demo.carolina@localcl.cl", servicio: "Tableros eléctricos y certificación TE1", cliente: 5, calificacion: 5, comentario: null, haceDias: 8 },
  { prestador: "demo.valentina@localcl.cl", servicio: "Cóctel para eventos y cumpleaños", cliente: 1, calificacion: 5, comentario: "El cóctel estuvo delicioso y llegaron puntuales.", haceDias: 18 },
  { prestador: "demo.valentina@localcl.cl", servicio: "Cóctel para eventos y cumpleaños", cliente: 4, calificacion: 4, comentario: null, haceDias: 9 },
  { prestador: "demo.jorge@localcl.cl", servicio: "Cerrajería de urgencia 24 horas", cliente: 2, calificacion: 4, comentario: "Abrió la puerta en veinte minutos, un domingo.", haceDias: 22 },
  { prestador: "demo.jorge@localcl.cl", servicio: "Muebles de cocina a medida", cliente: 3, calificacion: 5, comentario: "Los muebles quedaron tal como los diseñamos.", haceDias: 14 },
  {
    prestador: "demo.jorge@localcl.cl",
    servicio: "Cerrajería de urgencia 24 horas",
    cliente: 5,
    calificacion: 1,
    comentario: "Un sinvergüenza, no sabe hacer nada. No lo contraten jamás.",
    haceDias: 4,
    objetada: { motivo: "LENGUAJE_OFENSIVO", comentario: "Insulta y no dice qué pasó con el trabajo." },
  },
];

/**
 * Siembra contactos, valoraciones y la objeción pendiente. Idempotente y
 * SIN BORRAR: una valoración con una decisión de moderación no se puede
 * borrar (bitácora de solo inserción), así que si ya existe se deja como
 * esté (incluso si un administrador la ocultó durante una demostración).
 */
async function sembrarValoraciones(hashContrasena: string): Promise<number> {
  let creadas = 0;
  for (const demo of VALORACIONES_DEMO) {
    const datosCliente = CLIENTES_DEMO[demo.cliente];
    if (!datosCliente) continue;
    const cliente = await prisma.usuario.upsert({
      where: { correo: datosCliente.correo },
      update: {},
      create: {
        correo: datosCliente.correo,
        nombre: datosCliente.nombre,
        rol: "CLIENTE",
        correoVerificado: true,
        hashContrasena,
        creadoEn: new Date(Date.now() - datosCliente.haceDias * 24 * HORA),
      },
    });
    const perfil = await prisma.perfilPrestador.findFirst({ where: { usuario: { correo: demo.prestador } }, select: { id: true, usuarioId: true } });
    if (!perfil) continue;
    const servicio = await prisma.servicio.findFirst({ where: { prestadorId: perfil.id, titulo: demo.servicio }, select: { id: true } });
    if (!servicio) throw new Error(`El servicio de demostración «${demo.servicio}» no existe.`);

    // El contacto es POR ESE SERVICIO: es lo que habilita a valorarlo.
    const contacto =
      (await prisma.contacto.findFirst({ where: { clienteId: cliente.id, servicioId: servicio.id }, select: { id: true } })) ??
      (await prisma.contacto.create({
        data: {
          clienteId: cliente.id,
          prestadorId: perfil.id,
          servicioId: servicio.id,
          canal: "WHATSAPP",
          creadoEn: new Date(Date.now() - demo.haceDias * 24 * HORA),
        },
        select: { id: true },
      }));

    const existente = await prisma.valoracion.findUnique({
      where: { clienteId_servicioId: { clienteId: cliente.id, servicioId: servicio.id } },
      select: { id: true },
    });
    const valoracion =
      existente ??
      (await prisma.valoracion.create({
        data: {
          contactoId: contacto.id,
          clienteId: cliente.id,
          prestadorId: perfil.id,
          servicioId: servicio.id,
          calificacion: demo.calificacion,
          comentario: demo.comentario,
          creadoEn: new Date(Date.now() - (demo.haceDias - 1) * 24 * HORA),
        },
        select: { id: true },
      }));
    if (!existente) creadas += 1;

    if (demo.objetada && (await prisma.denuncia.count({ where: { valoracionId: valoracion.id } })) === 0) {
      await prisma.denuncia.create({
        data: {
          valoracionId: valoracion.id,
          denuncianteId: perfil.usuarioId,
          motivo: demo.objetada.motivo,
          detalle: demo.objetada.comentario,
          creadoEn: new Date(Date.now() - 2 * 24 * HORA),
        },
      });
    }
  }
  return creadas;
}

interface ReporteDemo {
  servicio: string;
  cliente: number;
  motivo: MotivoDenuncia;
  comentario?: string;
  haceHoras: number;
}

/**
 * Tres casos para la cola:
 * - «Gasfitería a domicilio»: 3 personas distintas → prioridad alta.
 * - «Cóctel para eventos y cumpleaños»: 1 persona, reciente.
 * - «Reparación de puertas y ventanas»: ya desestimado (cola de resueltos).
 */
const REPORTES_DEMO: ReporteDemo[] = [
  {
    servicio: "Gasfitería a domicilio",
    cliente: 0,
    motivo: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION",
    comentario: "Dice «visita sin costo» y pide que lo llamen por fuera.",
    haceHoras: 70,
  },
  { servicio: "Gasfitería a domicilio", cliente: 2, motivo: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION", haceHoras: 30 },
  { servicio: "Gasfitería a domicilio", cliente: 3, motivo: "CONTENIDO_ENGANOSO", comentario: "Los precios no son reales.", haceHoras: 26 },
  { servicio: "Cóctel para eventos y cumpleaños", cliente: 1, motivo: "IMAGENES_INAPROPIADAS", haceHoras: 5 },
  {
    servicio: "Reparación de puertas y ventanas",
    cliente: 1,
    motivo: "OTRO",
    comentario: "Creo que es la misma persona que otro servicio.",
    haceHoras: 100,
  },
];

async function sembrarReportes(idsPorTitulo: Map<string, string>, hashContrasena: string): Promise<number> {
  const clientes = [];
  for (const demo of CLIENTES_DEMO) {
    clientes.push(
      await prisma.usuario.upsert({
        where: { correo: demo.correo },
        update: { nombre: demo.nombre },
        create: {
          correo: demo.correo,
          nombre: demo.nombre,
          rol: "CLIENTE",
          correoVerificado: true,
          hashContrasena,
          creadoEn: new Date(Date.now() - demo.haceDias * 24 * HORA),
        },
      }),
    );
  }

  let creados = 0;
  for (const reporte of REPORTES_DEMO) {
    const servicioId = idsPorTitulo.get(reporte.servicio);
    const cliente = clientes[reporte.cliente];
    if (!servicioId || !cliente) continue;
    await prisma.denuncia.create({
      data: {
        denuncianteId: cliente.id,
        servicioId,
        motivo: reporte.motivo,
        detalle: reporte.comentario ?? null,
        creadoEn: new Date(Date.now() - reporte.haceHoras * HORA),
      },
    });
    creados += 1;
  }

  // Un caso ya resuelto, decidido por el administrador de prueba (si existe).
  const administrador = await prisma.usuario.findUnique({ where: { correo: "admin@localcl.cl" }, select: { id: true } });
  const resuelto = idsPorTitulo.get("Reparación de puertas y ventanas");
  if (administrador && resuelto) {
    const motivo = "La publicación es de un prestador verificado distinto; no hay suplantación.";
    const { count } = await prisma.denuncia.updateMany({
      where: { servicioId: resuelto, estado: "ABIERTA" },
      data: { estado: "DESESTIMADA", resolucion: motivo, resueltaPorId: administrador.id, resueltaEn: new Date(Date.now() - 50 * HORA) },
    });
    await prisma.decisionReporte.create({
      data: { servicioId: resuelto, accion: "DESESTIMAR", motivo, reportesCerrados: count, administradorId: administrador.id },
    });
  }

  return creados;
}

/** Aprobada por admin@localcl.cl (el CHECK exige saber quién la revisó). Sin ese usuario, se omite. */
async function sembrarCertificacionRevisada(prestadorId: string, datos: { nombre: string; emisor: string; identificador: string }) {
  const administrador = await prisma.usuario.findUnique({ where: { correo: "admin@localcl.cl" }, select: { id: true } });
  if (!administrador) {
    console.log("Sin admin@localcl.cl: se omite la certificación revisada a mano de la demostración.");
    return;
  }
  const tipo = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "OTRA" } });
  const existente = await prisma.credencial.findFirst({ where: { prestadorId, tipoId: tipo.id, nombrePersonalizado: datos.nombre } });
  if (existente) return;

  await prisma.credencial.create({
    data: {
      prestadorId,
      tipoId: tipo.id,
      estado: "VERIFICADA",
      metodo: "MANUAL",
      fechaConsulta: new Date(),
      verificadoPorId: administrador.id,
      fuente: "Revisión manual del documento por un administrador",
      identificadorDocumento: datos.identificador,
      nombrePersonalizado: datos.nombre,
      emisorPersonalizado: datos.emisor,
    },
  });
}

/** Igual que la certificación revisada, con el tipo CURSO: sin folio ni vigencia, con fecha de término y horas. */
async function sembrarCursoRevisado(
  prestadorId: string,
  datos: { nombre: string; institucion: string; fechaTermino: string; horas: number | null },
) {
  const administrador = await prisma.usuario.findUnique({ where: { correo: "admin@localcl.cl" }, select: { id: true } });
  if (!administrador) {
    console.log("Sin admin@localcl.cl: se omite el curso revisado a mano de la demostración.");
    return;
  }
  const tipo = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "CURSO" } });
  const existente = await prisma.credencial.findFirst({ where: { prestadorId, tipoId: tipo.id, nombrePersonalizado: datos.nombre } });
  if (existente) return;

  await prisma.credencial.create({
    data: {
      prestadorId,
      tipoId: tipo.id,
      estado: "VERIFICADA",
      metodo: "MANUAL",
      fechaConsulta: new Date(),
      verificadoPorId: administrador.id,
      fuente: "Revisión manual del documento por un administrador",
      identificadorDocumento: null,
      nombrePersonalizado: datos.nombre,
      emisorPersonalizado: datos.institucion,
      fechaTermino: new Date(`${datos.fechaTermino}T00:00:00Z`),
      horas: datos.horas,
    },
  });
}

async function main() {
  const hashContrasena = await hash(CONTRASENA);
  let servicios = 0;
  let fotos = 0;
  const idsPorTitulo = new Map<string, string>();
  const disponibles = await readdir(CARPETA_FOTOS).catch(() => [] as string[]);

  for (const demo of PRESTADORES) {
    const usuario = await prisma.usuario.upsert({
      where: { correo: demo.correo },
      update: { nombre: demo.nombre, rutVerificado: demo.identidad, activo: true },
      create: {
        correo: demo.correo,
        nombre: demo.nombre,
        rol: "PRESTADOR",
        rut: `${demo.rut}-${digitoVerificador(demo.rut)}`,
        rutVerificado: demo.identidad,
        correoVerificado: true,
        hashContrasena,
      },
    });

    const comunaId = await idComuna(demo.comunaBase);
    const perfil = await prisma.perfilPrestador.upsert({
      where: { usuarioId: usuario.id },
      update: { descripcion: demo.descripcion, telefono: demo.telefono, comunaId },
      create: { usuarioId: usuario.id, descripcion: demo.descripcion, telefono: demo.telefono, comunaId },
    });

    const comunaIds = await Promise.all(demo.comunas.map(idComuna));
    await prisma.prestadorComuna.deleteMany({ where: { prestadorId: perfil.id } });
    await prisma.prestadorComuna.createMany({ data: comunaIds.map((id) => ({ prestadorId: perfil.id, comunaId: id })) });

    if (demo.credencialOficial) {
      const tipo = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: demo.credencialOficial } });
      const existente = await prisma.credencial.findFirst({ where: { prestadorId: perfil.id, tipoId: tipo.id } });
      if (!existente) {
        await prisma.credencial.create({
          data: {
            prestadorId: perfil.id,
            tipoId: tipo.id,
            estado: "VERIFICADA",
            metodo: "AUTOMATICO",
            fechaConsulta: new Date(),
            identificadorDocumento: `DEMO-${demo.rut}`,
          },
        });
      }
    }

    if (demo.certificacionRevisada) {
      await sembrarCertificacionRevisada(perfil.id, demo.certificacionRevisada);
    }
    if (demo.cursoRevisado) {
      await sembrarCursoRevisado(perfil.id, demo.cursoRevisado);
    }

    // Los servicios de demostración se ACTUALIZAN en su lugar (se reconocen
    // por su título), no se borran: de ellos cuelgan contactos y valoraciones
    // (RESTRICT), y una valoración es definitiva. Sus fotos sí se rehacen:
    // primero se borran del almacenamiento (la base no puede hacerlo) y luego
    // las filas.
    const anteriores = await prisma.imagenServicio.findMany({
      where: { servicio: { prestadorId: perfil.id } },
      select: { identificador: true },
    });
    for (const { identificador } of anteriores) await obtenerAlmacenamientoPublico().eliminar(identificador);
    await prisma.imagenServicio.deleteMany({ where: { servicio: { prestadorId: perfil.id } } });
    // Los reportes de servicios se rehacen en sembrarReportes. La bitácora de
    // decisiones no se toca (solo inserción).
    await prisma.denuncia.deleteMany({ where: { servicio: { prestadorId: perfil.id } } });

    const existentes = await prisma.servicio.findMany({ where: { prestadorId: perfil.id }, select: { id: true, titulo: true } });

    for (const servicio of demo.servicios) {
      const datos = {
        categoriaId: await idCategoria(servicio.categoria),
        categoriaPersonalizada: servicio.categoriaPersonalizada ?? null,
        titulo: servicio.titulo,
        descripcion: servicio.descripcion,
        precioDesde: servicio.precioDesde,
        precioHasta: servicio.precioHasta ?? null,
        unidadPrecio: servicio.precioDesde === null ? null : (servicio.unidad ?? "POR_SERVICIO"),
        estado: servicio.estado ?? "PUBLICADO",
        creadoEn: new Date(Date.now() - servicio.haceDias * 24 * 60 * 60 * 1000),
      } as const;
      const actual = existentes.find((existente) => existente.titulo === servicio.titulo);
      const creado = actual
        ? await prisma.servicio.update({ where: { id: actual.id }, data: datos })
        : await prisma.servicio.create({ data: { prestadorId: perfil.id, ...datos } });
      servicios += 1;
      idsPorTitulo.set(servicio.titulo, creado.id);

      if (servicio.fotos) {
        const rutas = await fotosDe(servicio.fotos, disponibles);
        let orden = 0;
        for (const ruta of rutas) {
          if (await subirFoto(creado.id, ruta, orden)) {
            orden += 1;
            fotos += 1;
          }
        }
      }
    }
  }

  const reportes = await sembrarReportes(idsPorTitulo, hashContrasena);
  const valoraciones = await sembrarValoraciones(hashContrasena);

  // Se vectorizan, en lotes, los servicios nuevos o cuyo texto cambió (los
  // demás conservan su vector), con el proveedor de EMBEDDINGS_PROVEEDOR. Si
  // falla, quedan sin vector (siguen apareciendo por palabras) y basta correr
  // npm run embeddings:regenerar.
  const embeddings = await regenerarEmbeddings();
  console.log(
    `Embeddings: ${embeddings.vectorizados} servicios vectorizados en ${embeddings.llamadas} llamada(s)` +
      (embeddings.fallidos > 0 ? `, ${embeddings.fallidos} sin vector (corre npm run embeddings:regenerar).` : "."),
  );

  console.log(
    `${PRESTADORES.length} prestadores, ${servicios} servicios, ${fotos} fotos, ${reportes} reportes y ${valoraciones} valoraciones nuevas de demostración listos`,
  );
  if (fotos === 0) {
    console.log(`Sin fotos: copia archivos JPG, PNG o WEBP en ${CARPETA_FOTOS} (ver su README.md) y vuelve a correr el seed.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
