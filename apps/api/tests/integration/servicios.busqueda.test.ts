import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { EstadoServicio } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const SANTIAGO = 13101;
const LAS_CONDES = 13114;
const NUNOA = 13120;
const PROVIDENCIA = 13123;
const MAIPU = 13119;

const TELEFONO = "+56987654321";

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

/** Prestador con perfil. Por defecto con identidad verificada y atendiendo en Santiago. */
async function crearPrestador(opciones: { identidad?: boolean; comunas?: number[]; nombre?: string } = {}) {
  secuencia += 1;
  const usuario = await prisma.usuario.create({
    data: {
      correo: `prestador${secuencia}@ejemplo.cl`,
      nombre: opciones.nombre ?? `Prestador ${secuencia}`,
      rol: "PRESTADOR",
      rut: `${20000000 + secuencia}-K`,
      rutVerificado: opciones.identidad ?? true,
      correoVerificado: true,
    },
  });
  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: TELEFONO,
      descripcion: "Prestador con experiencia en la zona.",
      comunasAtencion: { create: (opciones.comunas ?? [SANTIAGO]).map((comunaId) => ({ comunaId })) },
    },
  });
  return { usuario, perfilId: perfil.id };
}

async function idCategoria(slug: string) {
  return (await prisma.categoria.findUniqueOrThrow({ where: { slug } })).id;
}

interface OpcionesServicio {
  titulo: string;
  descripcion?: string;
  categoria?: string;
  categoriaPersonalizada?: string | null;
  estado?: EstadoServicio;
  precioDesde?: number | null;
  creadoEn?: Date;
}

/** Se inserta directo: así se prueban estados que la API no dejaría crear (p. ej. PUBLICADO sin identidad). */
async function crearServicio(perfilId: string, opciones: OpcionesServicio) {
  const precioDesde = opciones.precioDesde === undefined ? 30000 : opciones.precioDesde;
  return prisma.servicio.create({
    data: {
      prestadorId: perfilId,
      categoriaId: await idCategoria(opciones.categoria ?? "gasfiteria"),
      categoriaPersonalizada: opciones.categoriaPersonalizada ?? null,
      titulo: opciones.titulo,
      descripcion: opciones.descripcion ?? "Trabajos garantizados, con boleta y materiales de primera.",
      precioDesde,
      unidadPrecio: precioDesde === null ? null : "POR_SERVICIO",
      estado: opciones.estado ?? "PUBLICADO",
      ...(opciones.creadoEn ? { creadoEn: opciones.creadoEn } : {}),
    },
  });
}

interface Resultado {
  id: string;
  titulo: string;
  categoria: { slug: string; nombre: string };
  precioDesde: number | null;
  aConvenir: boolean;
  prestador: { nombre: string; comunas: { id: number; nombre: string }[]; comunasRestantes: number; acreditado: boolean };
}

async function buscar(parametros: Record<string, string | number> = {}) {
  const respuesta = await request(app).get("/servicios").query(parametros);
  return { respuesta, resultados: (respuesta.body.resultados ?? []) as Resultado[] };
}

const titulos = (resultados: Resultado[]) => resultados.map((resultado) => resultado.titulo).sort();

describe("GET /servicios: búsqueda de texto", () => {
  it("«gasfiter» encuentra un servicio titulado «Gasfitería a domicilio»", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });
    await crearServicio(perfilId, { titulo: "Instalación de enchufes", categoria: "electricidad" });

    const { respuesta, resultados } = await buscar({ q: "gasfiter" });

    expect(respuesta.status).toBe(200);
    expect(titulos(resultados)).toEqual(["Gasfitería a domicilio"]);
  });

  it.each(["GASFITERÍA", "gasfiteria", "GaSfItErIa", "Gásfítéría"])("ignora tildes y mayúsculas: «%s»", async (texto) => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });

    const { resultados } = await buscar({ q: texto });

    expect(titulos(resultados)).toEqual(["Gasfitería a domicilio"]);
  });

  it("con varias palabras exige todas, cada una por prefijo", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });
    await crearServicio(perfilId, { titulo: "Gasfitería industrial" });

    const { resultados } = await buscar({ q: "gasfit domic" });

    expect(titulos(resultados)).toEqual(["Gasfitería a domicilio"]);
  });

  it("también busca en la descripción, en la categoría y en el oficio de «Otros»", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Arreglos en general", descripcion: "Reparación de calefont y termos eléctricos." });
    await crearServicio(perfilId, { titulo: "Atención las 24 horas", categoria: "cerrajeria" });
    await crearServicio(perfilId, {
      titulo: "Departamentos y casas",
      categoria: "otros",
      categoriaPersonalizada: "Pintura de interiores",
    });

    expect(titulos((await buscar({ q: "calefon" })).resultados)).toEqual(["Arreglos en general"]);
    expect(titulos((await buscar({ q: "cerrajer" })).resultados)).toEqual(["Atención las 24 horas"]);
    expect(titulos((await buscar({ q: "pintura" })).resultados)).toEqual(["Departamentos y casas"]);
  });

  it("un texto de solo palabras vacías («de la») no filtra en vez de no devolver nada", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });

    const { respuesta, resultados } = await buscar({ q: "de la" });

    expect(respuesta.status).toBe(200);
    expect(resultados).toHaveLength(1);
  });
});

describe("GET /servicios: qué nunca aparece", () => {
  it("un servicio pausado, oculto o en borrador nunca aparece, con o sin texto", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería publicada" });
    for (const estado of ["PAUSADO", "OCULTO", "BORRADOR"] as const) {
      await crearServicio(perfilId, { titulo: `Gasfitería ${estado.toLowerCase()}`, estado });
    }

    expect(titulos((await buscar()).resultados)).toEqual(["Gasfitería publicada"]);
    expect(titulos((await buscar({ q: "gasfiteria" })).resultados)).toEqual(["Gasfitería publicada"]);
    expect(titulos((await buscar({ comuna: SANTIAGO, categoria: "gasfiteria" })).resultados)).toEqual([
      "Gasfitería publicada",
    ]);
  });

  it("un servicio de un prestador sin identidad verificada nunca aparece, aunque figure como publicado", async () => {
    const verificado = await crearPrestador();
    const sinVerificar = await crearPrestador({ identidad: false });
    await crearServicio(verificado.perfilId, { titulo: "Gasfitería verificada" });
    await crearServicio(sinVerificar.perfilId, { titulo: "Gasfitería sin verificar" });

    expect(titulos((await buscar()).resultados)).toEqual(["Gasfitería verificada"]);
    expect(titulos((await buscar({ q: "gasfiteria" })).resultados)).toEqual(["Gasfitería verificada"]);
  });

  it("tampoco los de una cuenta desactivada", async () => {
    const { usuario, perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });
    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    expect((await buscar()).resultados).toHaveLength(0);
  });
});

describe("GET /servicios: filtros", () => {
  it("filtrar por comuna devuelve solo prestadores que la atienden, con esa comuna primero", async () => {
    const santiago = await crearPrestador({ comunas: [SANTIAGO] });
    const oriente = await crearPrestador({ comunas: [SANTIAGO, PROVIDENCIA, LAS_CONDES] });
    await crearServicio(santiago.perfilId, { titulo: "Gasfitería en el centro" });
    await crearServicio(oriente.perfilId, { titulo: "Gasfitería en el oriente" });

    const { resultados } = await buscar({ comuna: LAS_CONDES });

    expect(titulos(resultados)).toEqual(["Gasfitería en el oriente"]);
    expect(resultados[0]?.prestador.comunas[0]).toEqual({ id: LAS_CONDES, nombre: "Las Condes" });
  });

  it("el filtro por categoría funciona", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio", categoria: "gasfiteria" });
    await crearServicio(perfilId, { titulo: "Instalación de enchufes", categoria: "electricidad" });
    await crearServicio(perfilId, { titulo: "Tableros eléctricos", categoria: "electricidad" });

    const { resultados } = await buscar({ categoria: "electricidad" });

    expect(titulos(resultados)).toEqual(["Instalación de enchufes", "Tableros eléctricos"]);
    expect(resultados.every((resultado) => resultado.categoria.slug === "electricidad")).toBe(true);
  });

  it("una categoría que no existe no trae nada (no es un error)", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });

    const { respuesta, resultados } = await buscar({ categoria: "no-existe" });

    expect(respuesta.status).toBe(200);
    expect(resultados).toHaveLength(0);
  });

  it("precioMax deja fuera lo más caro y lo «a convenir»", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería económica", precioDesde: 20000 });
    await crearServicio(perfilId, { titulo: "Gasfitería exacta", precioDesde: 50000 });
    await crearServicio(perfilId, { titulo: "Gasfitería premium", precioDesde: 90000 });
    await crearServicio(perfilId, { titulo: "Gasfitería a convenir", precioDesde: null });

    const { resultados } = await buscar({ precioMax: 50000 });

    expect(titulos(resultados)).toEqual(["Gasfitería económica", "Gasfitería exacta"]);
  });

  it("los filtros se combinan", async () => {
    const oriente = await crearPrestador({ comunas: [LAS_CONDES] });
    const poniente = await crearPrestador({ comunas: [MAIPU] });
    await crearServicio(oriente.perfilId, { titulo: "Gasfitería en Las Condes", precioDesde: 40000 });
    await crearServicio(oriente.perfilId, { titulo: "Enchufes en Las Condes", categoria: "electricidad", precioDesde: 40000 });
    await crearServicio(poniente.perfilId, { titulo: "Gasfitería en Maipú", precioDesde: 40000 });

    const { resultados } = await buscar({ q: "gasfiter", categoria: "gasfiteria", comuna: LAS_CONDES, precioMax: 45000 });

    expect(titulos(resultados)).toEqual(["Gasfitería en Las Condes"]);
  });
});

describe("GET /servicios: orden y paginación", () => {
  it("sin filtros devuelve los publicados más recientes primero", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Servicio antiguo", creadoEn: new Date("2026-01-01") });
    await crearServicio(perfilId, { titulo: "Servicio nuevo", creadoEn: new Date("2026-10-01") });
    await crearServicio(perfilId, { titulo: "Servicio medio", creadoEn: new Date("2026-05-01") });

    const { resultados } = await buscar();

    expect(resultados.map((resultado) => resultado.titulo)).toEqual(["Servicio nuevo", "Servicio medio", "Servicio antiguo"]);
  });

  it("orden=precio va del más barato al más caro, con «a convenir» al final", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Servicio a convenir", precioDesde: null });
    await crearServicio(perfilId, { titulo: "Servicio caro", precioDesde: 90000 });
    await crearServicio(perfilId, { titulo: "Servicio barato", precioDesde: 10000 });

    const { resultados } = await buscar({ orden: "precio" });

    expect(resultados.map((resultado) => resultado.titulo)).toEqual(["Servicio barato", "Servicio caro", "Servicio a convenir"]);
    expect(resultados[2]?.aConvenir).toBe(true);
  });

  it.each(["recientes", "precio"])("la paginación no repite ni omite resultados (orden=%s)", async (orden) => {
    const { perfilId } = await crearPrestador();
    // Fechas y precios repetidos a propósito: el desempate por id es lo que se prueba.
    const fecha = new Date("2026-06-01T12:00:00Z");
    const creados = [];
    for (let i = 0; i < 23; i += 1) {
      creados.push(
        await crearServicio(perfilId, { titulo: `Servicio número ${i}`, creadoEn: fecha, precioDesde: i % 3 === 0 ? null : 10000 * (i % 4) }),
      );
    }

    const vistos: string[] = [];
    for (let pagina = 1; pagina <= 4; pagina += 1) {
      const { respuesta, resultados } = await buscar({ orden, pagina, porPagina: 7 });
      expect(respuesta.status).toBe(200);
      if (resultados.length > 0) expect(respuesta.body.total).toBe(23);
      vistos.push(...resultados.map((resultado) => resultado.id));
    }

    expect(vistos).toHaveLength(23);
    expect(new Set(vistos).size).toBe(23);
    expect([...vistos].sort()).toEqual(creados.map((servicio) => servicio.id).sort());
  });

  it("no entrega más de 20 por página", async () => {
    expect((await buscar({ porPagina: 21 })).respuesta.status).toBe(400);
    expect((await buscar({ porPagina: 20 })).respuesta.status).toBe(200);
  });

  it("rechaza parámetros mal formados con 400", async () => {
    for (const parametros of [{ comuna: "abc" }, { precioMax: -1 }, { orden: "azar" }, { pagina: 0 }]) {
      const { respuesta } = await buscar(parametros);
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    }
  });

  it("un parámetro vacío cuenta como ausente", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });

    const { respuesta, resultados } = await buscar({ q: "", comuna: "", categoria: "", precioMax: "" });

    expect(respuesta.status).toBe(200);
    expect(resultados).toHaveLength(1);
  });
});

describe("GET /servicios: contenido de cada resultado", () => {
  it("trae categoría, precio, nombre del prestador y hasta 3 comunas más un contador", async () => {
    const { perfilId } = await crearPrestador({ nombre: "Pedro Soto", comunas: [SANTIAGO, LAS_CONDES, NUNOA, PROVIDENCIA, MAIPU] });
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio", precioDesde: 25000 });

    const [resultado] = (await buscar()).resultados;

    expect(resultado).toMatchObject({
      titulo: "Gasfitería a domicilio",
      categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
      precioDesde: 25000,
      aConvenir: false,
      prestador: { nombre: "Pedro Soto", comunasRestantes: 2, acreditado: false },
    });
    expect(resultado?.prestador.comunas).toHaveLength(3);
  });

  it("marca acreditado solo con una credencial verificada contra el registro oficial", async () => {
    const conSec = await crearPrestador({ nombre: "Con SEC" });
    const soloManual = await crearPrestador({ nombre: "Solo manual" });
    await crearServicio(conSec.perfilId, { titulo: "Gasfitería certificada" });
    await crearServicio(soloManual.perfilId, { titulo: "Gasfitería sin sello" });

    const tipoSec = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "SEC_INSTALADOR_GAS" } });
    const tipoIdentidad = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "IDENTIDAD" } });
    // Una verificación debe ser trazable (CHECK credenciales_verificacion_trazable):
    // cuándo se consultó y, si fue manual, qué administrador la revisó.
    const administrador = await prisma.usuario.create({
      data: { correo: "admin.busqueda@ejemplo.cl", nombre: "Admin", rol: "ADMINISTRADOR", correoVerificado: true },
    });
    const fechaConsulta = new Date("2026-10-01T12:00:00Z");
    await prisma.credencial.create({
      data: {
        prestadorId: conSec.perfilId,
        tipoId: tipoSec.id,
        estado: "VERIFICADA",
        metodo: "AUTOMATICO",
        fechaConsulta,
        identificadorDocumento: "SEC-123",
      },
    });
    await prisma.credencial.create({
      data: {
        prestadorId: soloManual.perfilId,
        tipoId: tipoIdentidad.id,
        estado: "VERIFICADA",
        metodo: "MANUAL",
        fechaConsulta,
        verificadoPorId: administrador.id,
        identificadorDocumento: "11111111-1",
      },
    });

    const { resultados } = await buscar();
    const sello = Object.fromEntries(resultados.map((resultado) => [resultado.prestador.nombre, resultado.prestador.acreditado]));

    expect(sello).toEqual({ "Con SEC": true, "Solo manual": false });
  });

  it("la respuesta no incluye teléfono, correo ni RUT", async () => {
    const { usuario, perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });

    const { respuesta } = await buscar({ q: "gasfiter" });
    const texto = JSON.stringify(respuesta.body);

    expect(respuesta.body.resultados).toHaveLength(1);
    for (const prohibido of [TELEFONO, "987654321", usuario.correo, String(usuario.rut), "telefono", "correo", "rut"]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});

describe("GET /servicios: entradas hostiles", () => {
  // [texto, cuántos de los dos servicios debe traer]. Un texto sin letras ni
  // dígitos equivale a no escribir nada (trae los dos); los operadores de
  // tsquery y de SQL se descartan como separadores, nunca se interpretan.
  it.each([
    ["'", 2],
    ['"', 2],
    ["%_*", 2],
    ["\u0000", 2],
    ["gasfiter'", 1],
    ["gasfiter & | ! ( ) :* <-> \\", 1],
    ["😀 gasfiter 😀", 1],
    ["O'Higgins", 0],
    ["' OR '1'='1", 0],
    ["'; DROP TABLE servicios; --", 0],
    // «|» sería un OR en tsquery: si se colara, traería los dos.
    ["gas:*|enchufe", 0],
  ] as const)("«%s» no rompe la consulta ni permite inyección", async (texto, esperados) => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });
    await crearServicio(perfilId, { titulo: "Instalación de enchufes", categoria: "electricidad" });

    const { respuesta, resultados } = await buscar({ q: texto });

    expect(respuesta.status).toBe(200);
    expect(resultados).toHaveLength(esperados);
    // La tabla sigue ahí y con sus filas.
    expect(await prisma.servicio.count()).toBe(2);
  });

  it("una categoría con comillas se rechaza como mal formada, sin llegar a la base", async () => {
    const { respuesta } = await buscar({ categoria: "' OR '1'='1" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});
