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
 */
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/db.js";
import type { UnidadPrecio } from "../src/generated/prisma/client.js";

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
}

interface PrestadorDemo {
  correo: string;
  nombre: string;
  rut: number;
  telefono: string;
  identidad: boolean;
  /** Código de un tipo de credencial verificado contra el registro oficial. */
  credencialOficial?: string;
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
      },
      {
        titulo: "Mantención e instalación de calefont",
        descripcion: "Limpieza, cambio de membrana y revisión de gases. Instalador autorizado SEC.",
        categoria: "gasfiteria",
        precioDesde: 35000,
        unidad: "POR_SERVICIO",
        haceDias: 10,
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
    ],
  },
  {
    correo: "demo.jorge@localcl.cl",
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
      },
      {
        titulo: "Pintura de departamentos y casas",
        descripcion: "Empaste, reparación de grietas y pintura de muros y cielos. Materiales incluidos.",
        categoria: "otros",
        categoriaPersonalizada: "Pintura de interiores",
        precioDesde: 8000,
        unidad: "POR_METRO_CUADRADO",
        haceDias: 12,
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

async function main() {
  const hashContrasena = await hash(CONTRASENA);
  let servicios = 0;

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

    // Los servicios de demostración se rehacen desde cero en cada corrida.
    await prisma.servicio.deleteMany({ where: { prestadorId: perfil.id } });
    for (const servicio of demo.servicios) {
      await prisma.servicio.create({
        data: {
          prestadorId: perfil.id,
          categoriaId: await idCategoria(servicio.categoria),
          categoriaPersonalizada: servicio.categoriaPersonalizada ?? null,
          titulo: servicio.titulo,
          descripcion: servicio.descripcion,
          precioDesde: servicio.precioDesde,
          precioHasta: servicio.precioHasta ?? null,
          unidadPrecio: servicio.precioDesde === null ? null : (servicio.unidad ?? "POR_SERVICIO"),
          estado: servicio.estado ?? "PUBLICADO",
          creadoEn: new Date(Date.now() - servicio.haceDias * 24 * 60 * 60 * 1000),
        },
      });
      servicios += 1;
    }
  }

  console.log(`${PRESTADORES.length} prestadores y ${servicios} servicios de demostración listos`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
