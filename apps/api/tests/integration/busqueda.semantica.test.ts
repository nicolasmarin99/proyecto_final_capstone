import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { EstadoServicio } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { obtenerProveedorEmbeddings } from "../../src/modules/embeddings/index.js";
import { buscarServiciosPublicados } from "../../src/modules/servicios/servicios.busqueda.repository.js";
import { indexarServicios, regenerarEmbeddings } from "../../src/modules/servicios/servicios.indexacion.js";
import { vaciarCacheDeConsultas } from "../../src/modules/servicios/servicios.service.js";

/*
  Búsqueda híbrida (palabras + significado) con el proveedor DETERMINISTA:
  ninguna de estas pruebas llama a la API de Google (tests/setup.ts lo
  fuerza y además corta cualquier fetch a googleapis.com).
*/

const SANTIAGO = 13101;
const LAS_CONDES = 13114;
const CONTRASENA = "contrasena-segura-123";

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(async () => {
  await vaciar();
  vaciarCacheDeConsultas();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(vaciar);

let secuencia = 0;

async function crearPrestador(opciones: { identidad?: boolean; comunas?: number[] } = {}) {
  secuencia += 1;
  const correo = `semantica${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Prestador ${secuencia}`,
      rol: "PRESTADOR",
      rut: `${30000000 + secuencia}-K`,
      rutVerificado: opciones.identidad ?? true,
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: "+56987654321",
      descripcion: "Prestador con experiencia en la zona.",
      comunasAtencion: { create: (opciones.comunas ?? [SANTIAGO]).map((comunaId) => ({ comunaId })) },
    },
  });
  return { usuario, correo, perfilId: perfil.id };
}

async function sesion(correo: string): Promise<string> {
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return String(login.body.accessToken);
}

interface OpcionesServicio {
  titulo: string;
  descripcion?: string;
  categoria?: string;
  categoriaPersonalizada?: string | null;
  estado?: EstadoServicio;
  creadoEn?: Date;
  /** Calcular su vector (por defecto sí). Sin él, solo puede aparecer por palabras. */
  indexar?: boolean;
}

/** Se inserta directo (así se prueban estados que la API no dejaría crear) y se indexa aparte. */
async function crearServicio(perfilId: string, opciones: OpcionesServicio) {
  const servicio = await prisma.servicio.create({
    data: {
      prestadorId: perfilId,
      categoriaId: (await prisma.categoria.findUniqueOrThrow({ where: { slug: opciones.categoria ?? "gasfiteria" } })).id,
      categoriaPersonalizada: opciones.categoriaPersonalizada ?? null,
      titulo: opciones.titulo,
      descripcion: opciones.descripcion ?? "Trabajos garantizados, con boleta y materiales de primera.",
      precioDesde: 30000,
      unidadPrecio: "POR_SERVICIO",
      estado: opciones.estado ?? "PUBLICADO",
      ...(opciones.creadoEn ? { creadoEn: opciones.creadoEn } : {}),
    },
  });
  if (opciones.indexar ?? true) await indexarServicios([servicio.id]);
  return servicio;
}

async function embeddingDe(id: string) {
  const [fila] = await prisma.$queryRaw<{ vector: string | null; hash: string | null }[]>`
    SELECT embedding::text AS vector, embedding_texto_hash AS hash FROM servicios WHERE id = ${id}`;
  return fila;
}

interface Resultado {
  id: string;
  titulo: string;
  coincidencia: "texto" | "significado" | "ambas" | null;
}

async function buscar(parametros: Record<string, string | number> = {}) {
  const respuesta = await request(app).get("/servicios").query(parametros);
  return {
    respuesta,
    resultados: (respuesta.body.resultados ?? []) as Resultado[],
    titulos: ((respuesta.body.resultados ?? []) as Resultado[]).map((resultado) => resultado.titulo),
  };
}

const DESTAPE = {
  titulo: "Destape de alcantarillado",
  descripcion: "Destape con máquina de cañerías, desagües y cámaras. Atención el mismo día.",
};

describe("Búsqueda por significado", () => {
  it("encuentra un servicio cuyo significado coincide aunque no comparta ninguna palabra con la búsqueda", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, DESTAPE);
    await crearServicio(perfilId, { titulo: "Instalación de enchufes y luminarias", categoria: "electricidad" });

    const { respuesta, resultados, titulos } = await buscar({ q: "se me tapó el baño" });

    expect(respuesta.status).toBe(200);
    expect(titulos).toEqual(["Destape de alcantarillado"]);
    // Entró por significado, no por palabras, y la respuesta lo dice.
    expect(resultados[0]?.coincidencia).toBe("significado");
    expect(respuesta.body.incluyeRelacionados).toBe(true);
  });

  it("buscar el título exacto de un servicio lo devuelve primero: la parte por palabras no se degradó", async () => {
    const { perfilId } = await crearPrestador();
    const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    // El buscado es el MÁS ANTIGUO: si sale primero no es por fecha.
    await crearServicio(perfilId, { titulo: "Gasfitería a domicilio", creadoEn: hace(30) });
    await crearServicio(perfilId, { titulo: "Gasfitería y destapes a domicilio las 24 horas", creadoEn: hace(2) });
    await crearServicio(perfilId, { titulo: "Gasfitería industrial", creadoEn: hace(1) });
    await crearServicio(perfilId, { ...DESTAPE, creadoEn: hace(0) });

    const { resultados } = await buscar({ q: "Gasfitería a domicilio" });

    expect(resultados[0]?.titulo).toBe("Gasfitería a domicilio");
    expect(resultados[0]?.coincidencia).toBe("ambas");
  });

  it("una consulta sin relación con nada no devuelve resultados (umbral) y sugiere categorías", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, DESTAPE);
    await crearServicio(perfilId, { titulo: "Instalación de enchufes y luminarias", categoria: "electricidad" });

    const { respuesta, resultados } = await buscar({ q: "clases de piano para niños" });

    expect(respuesta.status).toBe(200);
    expect(resultados).toEqual([]);
    expect(respuesta.body.total).toBe(0);
    // En vez de una lista vacía sin explicación: categorías que sí tienen servicios.
    const sugerencias = respuesta.body.sugerencias as { slug: string; nombre: string }[];
    expect(sugerencias.length).toBeGreaterThan(0);
    expect(sugerencias.map((sugerencia) => sugerencia.slug).sort()).toEqual(["electricidad", "gasfiteria"]);
  });

  it("las sugerencias van de la categoría más cercana a la más lejana", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, { titulo: "Instalación de enchufes y luminarias", categoria: "electricidad" });
    await crearServicio(perfilId, { titulo: "Rejas y portones de fierro", categoria: "soldadura" });
    await crearServicio(perfilId, DESTAPE);

    // «tapó» y «desagüe» no aparecen en electricidad ni soldadura; sí en gasfitería.
    const { respuesta } = await buscar({ q: "se me tapó el desagüe", categoria: "electricidad" });

    expect(respuesta.body.total).toBe(0);
    expect(respuesta.body.sugerencias[0].slug).toBe("gasfiteria");
  });

  it("un servicio con embedding en null sigue apareciendo por la búsqueda de palabras", async () => {
    const { perfilId } = await crearPrestador();
    const sinVector = await crearServicio(perfilId, { titulo: "Cerrajería de urgencia", categoria: "cerrajeria", indexar: false });
    expect((await embeddingDe(sinVector.id))?.vector).toBeNull();

    const { resultados } = await buscar({ q: "cerrajería urgencia" });

    expect(resultados.map((resultado) => resultado.id)).toEqual([sinVector.id]);
    expect(resultados[0]?.coincidencia).toBe("texto");
  });
});

describe("Búsqueda por significado: lo que nunca aparece", () => {
  it("UN PRESTADOR SIN IDENTIDAD VERIFICADA NUNCA APARECE, aunque su servicio sea el semánticamente más cercano", async () => {
    const sinVerificar = await crearPrestador({ identidad: false });
    const verificado = await crearPrestador();
    // El del no verificado es idéntico a la búsqueda; el otro, apenas cercano.
    const cercano = await crearServicio(sinVerificar.perfilId, { titulo: "Se me tapó el baño", descripcion: "Destape de baño tapado." });
    await crearServicio(verificado.perfilId, { titulo: "Gasfitería general", descripcion: "Filtraciones, grifería y algún destape." });
    expect((await embeddingDe(cercano.id))?.vector).not.toBeNull();

    for (const q of ["se me tapó el baño", "Se me tapó el baño", "destape baño tapado"]) {
      const { resultados } = await buscar({ q });
      expect(resultados.map((resultado) => resultado.id)).not.toContain(cercano.id);
    }
  });

  it("un servicio de otra comuna no aparece cuando se filtró por comuna, por cercano que sea", async () => {
    const enSantiago = await crearPrestador({ comunas: [SANTIAGO] });
    const enLasCondes = await crearPrestador({ comunas: [LAS_CONDES] });
    const deOtraComuna = await crearServicio(enSantiago.perfilId, DESTAPE);
    // También relacionado (sobre el umbral), pero menos que el de Santiago, que es idéntico en significado.
    const deLaComuna = await crearServicio(enLasCondes.perfilId, { titulo: "Destape de cañerías", descripcion: "Desagües tapados y cámaras." });

    const { resultados } = await buscar({ q: "se me tapó el baño", comuna: LAS_CONDES });

    expect(resultados.map((resultado) => resultado.id)).toEqual([deLaComuna.id]);
    expect(resultados.map((resultado) => resultado.id)).not.toContain(deOtraComuna.id);
  });

  it("tampoco aparece un servicio pausado ni uno de otra categoría filtrada", async () => {
    const { perfilId } = await crearPrestador();
    const pausado = await crearServicio(perfilId, { ...DESTAPE, estado: "PAUSADO" });
    const gasfiteria = await crearServicio(perfilId, { titulo: "Destape urgente", descripcion: "Cañerías y desagües." });

    const sinFiltro = await buscar({ q: "se me tapó el baño" });
    const otraCategoria = await buscar({ q: "se me tapó el baño", categoria: "electricidad" });

    expect(sinFiltro.resultados.map((resultado) => resultado.id)).toEqual([gasfiteria.id]);
    expect(sinFiltro.resultados.map((resultado) => resultado.id)).not.toContain(pausado.id);
    expect(otraCategoria.resultados).toEqual([]);
  });
});

describe("Embeddings al publicar y editar", () => {
  const SERVICIO = {
    categoria: "gasfiteria",
    titulo: "Destape de alcantarillado",
    descripcion: "Destape con máquina de cañerías, desagües y cámaras.",
    precioDesde: 25000,
    precioHasta: 60000,
    unidadPrecio: "POR_SERVICIO",
    estado: "PUBLICADO",
  };

  it("al publicar se calcula y se guarda el vector, con su hash y fecha", async () => {
    const { correo } = await crearPrestador();
    const espia = vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar");

    const respuesta = await request(app).post("/servicios").set("Authorization", `Bearer ${await sesion(correo)}`).send(SERVICIO);

    expect(respuesta.status).toBe(201);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith([expect.stringContaining("Destape de alcantarillado")], "documento");
    const guardado = await embeddingDe(String(respuesta.body.servicio.id));
    expect(guardado?.vector).not.toBeNull();
    expect(guardado?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("si el proveedor de embeddings lanza error al publicar, el servicio se publica igual con embedding en null", async () => {
    const { correo } = await crearPrestador();
    vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar").mockRejectedValueOnce(new Error("Gemini respondió 503."));
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const respuesta = await request(app).post("/servicios").set("Authorization", `Bearer ${await sesion(correo)}`).send(SERVICIO);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.servicio.estado).toBe("PUBLICADO");
    const id = String(respuesta.body.servicio.id);
    expect(await embeddingDe(id)).toEqual({ vector: null, hash: null });
    // El fallo queda registrado, con el id y el motivo.
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("No se pudieron calcular los embeddings"), { servicios: [id] }, "Gemini respondió 503.");
    // Y se encuentra por palabras.
    expect((await buscar({ q: "destape alcantarillado" })).resultados.map((resultado) => resultado.id)).toEqual([id]);
  });

  it("editar un servicio sin cambiar el texto no genera una nueva llamada al proveedor; cambiarlo sí", async () => {
    const { correo } = await crearPrestador();
    const token = await sesion(correo);
    const espia = vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar");
    const creado = await request(app).post("/servicios").set("Authorization", `Bearer ${token}`).send(SERVICIO);
    const id = String(creado.body.servicio.id);
    const antes = await embeddingDe(id);
    expect(espia).toHaveBeenCalledTimes(1);

    // Cambia el precio y el estado, no el texto.
    const mismoTexto = await request(app)
      .put(`/servicios/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...SERVICIO, precioDesde: 30000, estado: "PAUSADO" });
    expect(mismoTexto.status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(await embeddingDe(id)).toEqual(antes);

    const otroTexto = await request(app)
      .put(`/servicios/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...SERVICIO, titulo: "Destape de cañerías" });
    expect(otroTexto.status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(2);
    expect((await embeddingDe(id))?.hash).not.toBe(antes?.hash);
  });

  it("si el proveedor falla al editar con texto nuevo, el vector viejo se borra (describía otro texto)", async () => {
    const { correo } = await crearPrestador();
    const token = await sesion(correo);
    const creado = await request(app).post("/servicios").set("Authorization", `Bearer ${token}`).send(SERVICIO);
    const id = String(creado.body.servicio.id);
    expect((await embeddingDe(id))?.vector).not.toBeNull();
    vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar").mockRejectedValueOnce(new Error("Gemini respondió 429."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const editado = await request(app).put(`/servicios/${id}`).set("Authorization", `Bearer ${token}`).send({ ...SERVICIO, titulo: "Destape urgente" });

    expect(editado.status).toBe(200);
    expect(await embeddingDe(id)).toEqual({ vector: null, hash: null });
  });
});

describe("Script de regeneración", () => {
  it("es idempotente: correrlo dos veces no cambia el resultado ni duplica llamadas; procesa en lotes", async () => {
    const { perfilId } = await crearPrestador();
    const ids: string[] = [];
    for (const titulo of ["Destape de alcantarillado", "Gasfitería a domicilio", "Instalación de enchufes", "Rejas de fierro", "Muebles a medida"]) {
      ids.push((await crearServicio(perfilId, { titulo, indexar: false })).id);
    }
    const espia = vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar");

    const primera = await regenerarEmbeddings({ tamanoLote: 2 });
    const vectores = await Promise.all(ids.map(embeddingDe));

    expect(primera).toMatchObject({ revisados: 5, pendientes: 5, vectorizados: 5, fallidos: 0, llamadas: 3 });
    expect(espia).toHaveBeenCalledTimes(3);
    expect(vectores.every((fila) => fila?.vector !== null)).toBe(true);

    const segunda = await regenerarEmbeddings({ tamanoLote: 2 });

    expect(segunda).toMatchObject({ revisados: 5, pendientes: 0, vectorizados: 0, llamadas: 0 });
    expect(espia).toHaveBeenCalledTimes(3);
    expect(await Promise.all(ids.map(embeddingDe))).toEqual(vectores);
  });

  it("rehace solo los desactualizados: un texto cambiado por fuera de la API", async () => {
    const { perfilId } = await crearPrestador();
    const uno = await crearServicio(perfilId, { titulo: "Destape de alcantarillado" });
    const otro = await crearServicio(perfilId, { titulo: "Gasfitería a domicilio" });
    const otroAntes = await embeddingDe(otro.id);
    await prisma.servicio.update({ where: { id: uno.id }, data: { titulo: "Destape de cañerías" } });
    const espia = vi.spyOn(obtenerProveedorEmbeddings(), "vectorizar");

    const resultado = await regenerarEmbeddings();

    expect(resultado).toMatchObject({ pendientes: 1, vectorizados: 1, llamadas: 1 });
    expect(espia).toHaveBeenCalledWith([expect.stringContaining("Destape de cañerías")], "documento");
    expect(await embeddingDe(otro.id)).toEqual(otroAntes);
  });
});

describe("Búsqueda híbrida: orden, paginación y entradas hostiles", () => {
  it("la misma consulta da siempre el mismo orden y las páginas no se repiten ni se saltan", async () => {
    const { perfilId } = await crearPrestador();
    for (let i = 0; i < 9; i += 1) {
      await crearServicio(perfilId, { titulo: `Destape de cañerías ${i}`, descripcion: "Desagües y alcantarillado." });
    }

    const completa = await buscar({ q: "se me tapó el baño destape", porPagina: 20 });
    const otraVez = await buscar({ q: "se me tapó el baño destape", porPagina: 20 });
    const paginas: string[] = [];
    for (const pagina of [1, 2, 3]) {
      const { resultados } = await buscar({ q: "se me tapó el baño destape", porPagina: 4, pagina });
      paginas.push(...resultados.map((resultado) => resultado.id));
    }

    expect(completa.resultados).toHaveLength(9);
    expect(otraVez.resultados.map((resultado) => resultado.id)).toEqual(completa.resultados.map((resultado) => resultado.id));
    expect(paginas).toEqual(completa.resultados.map((resultado) => resultado.id));
  });

  it("la consulta del usuario no puede inyectar SQL en la búsqueda vectorial", async () => {
    const sinVerificar = await crearPrestador({ identidad: false });
    const { perfilId } = await crearPrestador();
    const oculto = await crearServicio(sinVerificar.perfilId, DESTAPE);
    await crearServicio(perfilId, DESTAPE);

    for (const q of [
      "'; DROP TABLE servicios; --",
      "baño') OR 1=1 --",
      "[0.1,0.2]'::vector) OR TRUE --",
      "x'; UPDATE usuarios SET rut_verificado = true; --",
    ]) {
      const { respuesta, resultados } = await buscar({ q });
      expect(respuesta.status).toBe(200);
      expect(resultados.map((resultado) => resultado.id)).not.toContain(oculto.id);
    }

    expect(await prisma.servicio.count()).toBe(2);
    expect(await prisma.usuario.count({ where: { rutVerificado: true } })).toBe(1);
  });

  it("un vector malicioso llega como parámetro: la base lo rechaza como vector inválido, no lo ejecuta", async () => {
    const { perfilId } = await crearPrestador();
    await crearServicio(perfilId, DESTAPE);

    await expect(
      buscarServiciosPublicados({
        consulta: "destape:*",
        vector: "[0.1]'); DROP TABLE servicios; --",
        umbral: 0.5,
        kRrf: 60,
        candidatosSemanticos: 100,
        categoria: null,
        comuna: null,
        precioMax: null,
        orden: "relevancia",
        limite: 10,
        desplazamiento: 0,
        comunasPorResultado: 3,
      }),
    ).rejects.toThrow(/vector/i);
    expect(await prisma.servicio.count()).toBe(1);
  });
});
