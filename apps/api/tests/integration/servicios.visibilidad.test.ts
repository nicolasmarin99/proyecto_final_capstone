import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { EstadoServicio } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const CONTRASENA = "contrasena-segura-123";
const SANTIAGO = 13101;

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

interface CondicionesPrestador {
  rutVerificado?: boolean;
  activo?: boolean;
  anonimizado?: boolean;
}

/** Prestador con perfil y un servicio en el estado pedido. Por defecto, todo en regla y PUBLICADO. */
async function crearServicio(estado: EstadoServicio = "PUBLICADO", condiciones: CondicionesPrestador = {}, titulo = "Gasfitería a domicilio") {
  secuencia += 1;
  // Una cuenta anonimizada tiene que verse como tal (CHECK
  // usuarios_anonimizado_sin_datos_personales): sin correo real, nombre,
  // contraseña ni RUT, e inactiva.
  const anonimizado = condiciones.anonimizado ?? false;
  const correo = anonimizado ? `anonimo+${secuencia}@localcl.invalid` : `prestador${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: anonimizado ? "Usuario eliminado" : `Prestador ${secuencia}`,
      rol: "PRESTADOR",
      rut: anonimizado ? null : `${50000000 + secuencia}-K`,
      rutVerificado: condiciones.rutVerificado ?? true,
      activo: anonimizado ? false : (condiciones.activo ?? true),
      anonimizadoEn: anonimizado ? new Date() : null,
      correoVerificado: true,
      hashContrasena: anonimizado ? null : await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const { id: categoriaId } = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: "+56912345678",
      descripcion: "Prestador con experiencia en la zona.",
      comunasAtencion: { create: [{ comunaId: SANTIAGO }] },
    },
  });
  const servicio = await prisma.servicio.create({
    data: {
      prestadorId: perfil.id,
      categoriaId,
      titulo,
      descripcion: "Trabajos garantizados, con boleta y materiales de primera calidad.",
      estado,
    },
  });
  return { usuario, correo, perfilId: perfil.id, servicioId: servicio.id };
}

async function crearCliente() {
  secuencia += 1;
  const correo = `cliente${secuencia}@ejemplo.cl`;
  await prisma.usuario.create({
    data: {
      correo,
      nombre: `Cliente ${secuencia}`,
      rol: "CLIENTE",
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return String(login.body.accessToken);
}

const pagina = (servicioId: string) => request(app).get(`/servicios/${servicioId}`);

describe("GET /servicios/:id: la misma regla que el buscador", () => {
  it("servicio publicado de prestador verificado: 200", async () => {
    const { servicioId } = await crearServicio();

    const respuesta = await pagina(servicioId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.servicio.id).toBe(servicioId);
  });

  it("el mismo servicio después de revocar la identidad del prestador: 404", async () => {
    const { usuario, servicioId } = await crearServicio();
    expect((await pagina(servicioId)).status).toBe(200);

    await prisma.usuario.update({ where: { id: usuario.id }, data: { rutVerificado: false } });

    expect((await pagina(servicioId)).status).toBe(404);
  });

  it("pausado, oculto por moderación, en borrador o de una cuenta inactiva o anonimizada: 404", async () => {
    const casos = [
      await crearServicio("PAUSADO"),
      await crearServicio("OCULTO"),
      await crearServicio("BORRADOR"),
      await crearServicio("PUBLICADO", { activo: false }),
      await crearServicio("PUBLICADO", { anonimizado: true }),
    ];

    for (const { servicioId } of casos) expect((await pagina(servicioId)).status).toBe(404);
  });

  it("un servicio inexistente responde 404 con exactamente el mismo cuerpo que los demás", async () => {
    const revocado = await crearServicio("PUBLICADO", { rutVerificado: false });
    const pausado = await crearServicio("PAUSADO");
    const oculto = await crearServicio("OCULTO");

    const inexistente = await pagina("no-existe");
    const otroInexistente = await pagina("8c2d8f44-0b8e-4c46-9d6a-6b7a3f0e2a11");

    expect(inexistente.status).toBe(404);
    for (const respuesta of [otroInexistente, await pagina(revocado.servicioId), await pagina(pausado.servicioId), await pagina(oculto.servicioId)]) {
      expect(respuesta.status).toBe(404);
      // Mismo código, mismo mensaje, mismas claves: nada que permita distinguir el motivo.
      expect(respuesta.body).toEqual(inexistente.body);
    }
    expect(inexistente.body).toEqual({ error: { codigo: "SERVICIO_NO_ENCONTRADO", mensaje: "Ese servicio no existe o no está publicado." } });
  });
});

describe("Otros caminos públicos aplican la misma regla", () => {
  it("el contacto de un prestador cuyo servicio ya no es visible se rechaza, y no queda registrado", async () => {
    const { usuario, perfilId, servicioId } = await crearServicio();
    const cliente = await crearCliente();
    const contacto = () =>
      request(app).get(`/prestadores/${perfilId}/contacto`).query({ servicio: servicioId }).set("Authorization", `Bearer ${cliente}`);
    expect((await contacto()).status).toBe(200);

    await prisma.usuario.update({ where: { id: usuario.id }, data: { rutVerificado: false } });

    const conServicio = await contacto();
    const sinServicio = await request(app).get(`/prestadores/${perfilId}/contacto`).set("Authorization", `Bearer ${cliente}`);

    expect(conServicio.status).toBe(404);
    // Sin servicio ya no es un contacto válido (cada contacto es por un
    // servicio): se rechaza antes, como dato faltante. Tampoco entrega nada.
    expect(sinServicio.status).toBe(400);
    expect(JSON.stringify([conServicio.body, sinServicio.body])).not.toContain("+569");
    // Solo el contacto de antes de revocar quedó registrado.
    expect(await prisma.contacto.count({ where: { prestadorId: perfilId } })).toBe(1);
  });

  it("el contacto por un servicio pausado de un prestador que tiene otro visible también se rechaza", async () => {
    const { perfilId, servicioId } = await crearServicio("PAUSADO");
    const { id: categoriaId } = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
    await prisma.servicio.create({
      data: { prestadorId: perfilId, categoriaId, titulo: "Otro servicio visible", descripcion: "Descripción suficientemente larga del otro servicio.", estado: "PUBLICADO" },
    });
    const cliente = await crearCliente();

    const respuesta = await request(app).get(`/prestadores/${perfilId}/contacto`).query({ servicio: servicioId }).set("Authorization", `Bearer ${cliente}`);

    expect(respuesta.status).toBe(400);
    expect(await prisma.contacto.count({ where: { prestadorId: perfilId } })).toBe(0);
  });

  it("no se puede reportar un servicio que el público no ve, y la respuesta es la misma que su página", async () => {
    const { servicioId } = await crearServicio("PUBLICADO", { rutVerificado: false });
    const cliente = await crearCliente();

    const reporte = await request(app)
      .post(`/servicios/${servicioId}/reportes`)
      .set("Authorization", `Bearer ${cliente}`)
      .send({ motivo: "CONTENIDO_ENGANOSO" });

    expect(reporte.status).toBe(404);
    expect(reporte.body).toEqual((await pagina(servicioId)).body);
    expect(await prisma.denuncia.count()).toBe(0);
  });

  it("el dueño ve en /servicios/mios si su servicio es visible al público", async () => {
    const { usuario, correo } = await crearServicio();
    const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
    const mios = () => request(app).get("/servicios/mios").set("Authorization", `Bearer ${String(login.body.accessToken)}`);
    expect((await mios()).body.servicios[0].visiblePublicamente).toBe(true);

    await prisma.usuario.update({ where: { id: usuario.id }, data: { rutVerificado: false } });

    const despues = await mios();
    expect(despues.body.servicios[0]).toMatchObject({ estado: "PUBLICADO", visiblePublicamente: false });
    expect(despues.body.requisitosPendientes.map((requisito: { codigo: string }) => requisito.codigo)).toContain("IDENTIDAD_NO_VERIFICADA");
  });
});

describe("Consistencia: aparece en el buscador si y solo si su página responde 200", () => {
  /** Una palabra distinta por caso, todas del mismo largo: la búsqueda por prefijo no las confunde. */
  const LETRAS = "abcdefghijklmnopqrstuvwxyz";
  const palabra = (indice: number) => `zzcaso${LETRAS[Math.floor(indice / 26)] ?? "z"}${LETRAS[indice % 26] ?? "z"}`;

  it("en todas las combinaciones de estado del servicio y condición del prestador", async () => {
    const estados: EstadoServicio[] = ["PUBLICADO", "PAUSADO", "OCULTO", "BORRADOR"];
    const casos: { servicioId: string; palabra: string; descripcion: string }[] = [];
    let indice = 0;

    for (const estado of estados) {
      for (const rutVerificado of [true, false]) {
        for (const activo of [true, false]) {
          for (const anonimizado of [false, true]) {
            // Una cuenta anonimizada siempre está inactiva: la combinación contraria no existe en la base.
            if (anonimizado && activo) continue;
            const clave = palabra(indice);
            indice += 1;
            const { servicioId } = await crearServicio(estado, { rutVerificado, activo, anonimizado }, `Servicio ${clave}`);
            casos.push({ servicioId, palabra: clave, descripcion: `${estado} rut=${rutVerificado} activo=${activo} anonimizado=${anonimizado}` });
          }
        }
      }
    }

    // También sin filtros: todos los resultados del buscador, página por página.
    const enListado = new Set<string>();
    for (let numero = 1; numero <= 5; numero += 1) {
      const { body } = await request(app).get("/servicios").query({ porPagina: 20, pagina: numero });
      for (const resultado of body.resultados as { id: string }[]) enListado.add(resultado.id);
    }

    let visibles = 0;
    for (const caso of casos) {
      const busqueda = await request(app).get("/servicios").query({ q: caso.palabra });
      const enBuscador = (busqueda.body.resultados as { id: string }[]).some((resultado) => resultado.id === caso.servicioId);
      const estado = (await pagina(caso.servicioId)).status;

      // El mensaje dice qué combinación rompió la regla, si alguna lo hace.
      expect({ caso: caso.descripcion, enBuscador, enListado: enListado.has(caso.servicioId) }).toEqual({
        caso: caso.descripcion,
        enBuscador: estado === 200,
        enListado: estado === 200,
      });
      expect([200, 404]).toContain(estado);
      if (estado === 200) visibles += 1;
    }

    // 4 estados × 2 de identidad × 3 de cuenta (activa, inactiva, anonimizada) = 24.
    // Exactamente una cumple todo: PUBLICADO, verificado, activo y sin anonimizar.
    expect(casos).toHaveLength(24);
    expect(visibles).toBe(1);
  });
});
