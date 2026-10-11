import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const CONTRASENA = "contrasena-segura-123";
const SANTIAGO = 13101;
const LAS_CONDES = 13114;
const TELEFONO = "+56912345678";

const SERVICIO_VALIDO = {
  categoria: "gasfiteria",
  titulo: "Gasfitería a domicilio",
  descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
  precioDesde: 25000,
  precioHasta: 60000,
  unidadPrecio: "POR_SERVICIO",
  estado: "PUBLICADO",
};

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; rutVerificado?: boolean } = {}) {
  secuencia += 1;
  const correo = `persona${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      rut: rol === "PRESTADOR" ? `${10000000 + secuencia}-K` : null,
      rutVerificado: opciones.rutVerificado ?? false,
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

/** Prestador con perfil. Por defecto, listo para publicar: identidad verificada y una comuna. */
async function crearPrestador(
  opciones: { identidad?: boolean; comunas?: number[]; correoVerificado?: boolean; conPerfil?: boolean } = {},
) {
  const usuario = await crearUsuario("PRESTADOR", {
    rutVerificado: opciones.identidad ?? true,
    correoVerificado: opciones.correoVerificado,
  });
  if (opciones.conPerfil === false) return { ...usuario, perfilId: "" };

  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: TELEFONO,
      descripcion: "Gasfíter con experiencia en la zona oriente.",
      comunasAtencion: { create: (opciones.comunas ?? [SANTIAGO]).map((comunaId) => ({ comunaId })) },
    },
  });
  return { ...usuario, perfilId: perfil.id };
}

function crear(token: string, cuerpo: object = SERVICIO_VALIDO) {
  return request(app).post("/servicios").set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function editar(token: string, id: string, cuerpo: object = SERVICIO_VALIDO) {
  return request(app).put(`/servicios/${id}`).set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function borrar(token: string, id: string) {
  return request(app).delete(`/servicios/${id}`).set("Authorization", `Bearer ${token}`);
}

function contacto(token: string | null, prestadorId: string, servicioId?: string) {
  const ruta = `/prestadores/${prestadorId}/contacto${servicioId ? `?servicio=${servicioId}` : ""}`;
  const peticion = request(app).get(ruta);
  return token ? peticion.set("Authorization", `Bearer ${token}`) : peticion;
}

function codigos(cuerpo: { requisitosPendientes?: { codigo: string }[] }) {
  return (cuerpo.requisitosPendientes ?? []).map((requisito) => requisito.codigo);
}

function detalleDe(cuerpo: { error?: { detalles?: { campo: string; mensaje: string }[] } }, campo: string) {
  return cuerpo.error?.detalles?.find((detalle) => detalle.campo === campo)?.mensaje;
}

describe("POST /servicios", () => {
  it("con identidad verificada y comunas de atención: queda PUBLICADO", async () => {
    const prestador = await crearPrestador();

    const respuesta = await crear(prestador.token);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.servicio).toMatchObject({
      titulo: SERVICIO_VALIDO.titulo,
      estado: "PUBLICADO",
      categoria: { slug: "gasfiteria" },
      precioDesde: 25000,
      precioHasta: 60000,
    });
    expect(respuesta.body.requisitosPendientes).toEqual([]);
  });

  it("sin identidad verificada: queda PAUSADO y la respuesta dice por qué", async () => {
    const prestador = await crearPrestador({ identidad: false });

    const respuesta = await crear(prestador.token);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.servicio.estado).toBe("PAUSADO");
    expect(codigos(respuesta.body)).toEqual(["IDENTIDAD_NO_VERIFICADA"]);
    expect(respuesta.body.requisitosPendientes[0].mensaje).toMatch(/identidad/i);
  });

  it("sin comunas de atención: queda PAUSADO y la respuesta dice por qué", async () => {
    const prestador = await crearPrestador({ comunas: [] });

    const respuesta = await crear(prestador.token);

    expect(respuesta.body.servicio.estado).toBe("PAUSADO");
    expect(codigos(respuesta.body)).toEqual(["SIN_COMUNAS_ATENCION"]);
    expect(respuesta.body.requisitosPendientes[0].mensaje).toMatch(/comuna/i);
  });

  it("si pide PAUSADO, queda PAUSADO aunque cumpla los requisitos", async () => {
    const prestador = await crearPrestador();

    const respuesta = await crear(prestador.token, { ...SERVICIO_VALIDO, estado: "PAUSADO" });

    expect(respuesta.body.servicio.estado).toBe("PAUSADO");
    expect(respuesta.body.requisitosPendientes).toEqual([]);
  });

  it("sin precio: se guarda como «a convenir» (precios en null)", async () => {
    const prestador = await crearPrestador();
    const { precioDesde: _d, precioHasta: _h, unidadPrecio: _u, ...sinPrecio } = SERVICIO_VALIDO;

    const respuesta = await crear(prestador.token, sinPrecio);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.servicio).toMatchObject({ precioDesde: null, precioHasta: null, unidadPrecio: null });
  });

  it("un cliente no puede crear servicios: 403", async () => {
    const cliente = await crearUsuario("CLIENTE");

    expect((await crear(cliente.token)).status).toBe(403);
  });

  it("un prestador sin correo verificado: 403", async () => {
    const prestador = await crearPrestador({ correoVerificado: false });

    const respuesta = await crear(prestador.token);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CORREO_NO_VERIFICADO");
  });

  it("sin sesión: 401", async () => {
    expect((await request(app).post("/servicios").send(SERVICIO_VALIDO)).status).toBe(401);
  });

  it("un prestador sin perfil: 409, primero tiene que completarlo", async () => {
    const prestador = await crearPrestador({ conPerfil: false });

    const respuesta = await crear(prestador.token);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PERFIL_REQUERIDO");
  });

  it.each([
    ["título de 9 caracteres", { titulo: "a".repeat(9) }, "titulo"],
    ["descripción de 29 caracteres", { descripcion: "a".repeat(29) }, "descripcion"],
    ["precio desde mayor que precio hasta", { precioDesde: 60000, precioHasta: 25000 }, "precioHasta"],
    ["precio sin unidad", { unidadPrecio: null }, "unidadPrecio"],
    ["precio hasta sin precio desde", { precioDesde: null }, "precioHasta"],
    ["precio negativo", { precioDesde: -1 }, "precioDesde"],
    ["categoría inexistente", { categoria: "astrologia" }, "categoria"],
    ["estado que no le corresponde (OCULTO)", { estado: "OCULTO" }, "estado"],
  ])("%s: 400 con detalle en el campo", async (_caso, cambio, campo) => {
    const prestador = await crearPrestador();

    const respuesta = await crear(prestador.token, { ...SERVICIO_VALIDO, ...cambio });

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, campo)).toBeDefined();
    expect(await prisma.servicio.count()).toBe(0);
  });
});

describe("PUT y DELETE /servicios/:id", () => {
  it("un prestador no puede editar ni borrar el servicio de otro: 403", async () => {
    const duena = await crearPrestador();
    const otro = await crearPrestador();
    const { body } = await crear(duena.token);

    expect((await editar(otro.token, body.servicio.id, { ...SERVICIO_VALIDO, titulo: "Título cambiado por otro" })).status).toBe(403);
    expect((await borrar(otro.token, body.servicio.id)).status).toBe(403);
    expect(await prisma.servicio.findUniqueOrThrow({ where: { id: body.servicio.id } })).toMatchObject({
      titulo: SERVICIO_VALIDO.titulo,
    });
  });

  it("la dueña edita su servicio: 200 con los cambios", async () => {
    const duena = await crearPrestador();
    const { body } = await crear(duena.token);

    const respuesta = await editar(duena.token, body.servicio.id, { ...SERVICIO_VALIDO, titulo: "Gasfitería y destapes urgentes" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.servicio).toMatchObject({ id: body.servicio.id, titulo: "Gasfitería y destapes urgentes" });
  });

  it("al cumplir los requisitos, volver a guardar lo publica", async () => {
    const prestador = await crearPrestador({ identidad: false });
    const { body } = await crear(prestador.token);
    expect(body.servicio.estado).toBe("PAUSADO");

    await prisma.usuario.update({ where: { id: prestador.id }, data: { rutVerificado: true } });
    const respuesta = await editar(prestador.token, body.servicio.id);

    expect(respuesta.body.servicio.estado).toBe("PUBLICADO");
  });

  it("un servicio ocultado por moderación sigue OCULTO aunque se edite", async () => {
    const prestador = await crearPrestador();
    const { body } = await crear(prestador.token);
    await prisma.servicio.update({ where: { id: body.servicio.id }, data: { estado: "OCULTO" } });

    const respuesta = await editar(prestador.token, body.servicio.id);

    expect(respuesta.body.servicio.estado).toBe("OCULTO");
  });

  it("borrar un servicio sin contactos: 204 y desaparece", async () => {
    const prestador = await crearPrestador();
    const { body } = await crear(prestador.token);

    expect((await borrar(prestador.token, body.servicio.id)).status).toBe(204);
    expect(await prisma.servicio.count()).toBe(0);
  });

  it("borrar un servicio con contactos: 409, se puede pausar pero no borrar", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearUsuario("CLIENTE");
    const { body } = await crear(prestador.token);
    await contacto(cliente.token, prestador.perfilId, body.servicio.id);

    const respuesta = await borrar(prestador.token, body.servicio.id);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("SERVICIO_CON_CONTACTOS");
    expect(await prisma.servicio.count()).toBe(1);
  });

  it("un servicio inexistente: 404", async () => {
    const prestador = await crearPrestador();

    expect((await borrar(prestador.token, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});

describe("GET /servicios/mios", () => {
  it("devuelve solo los propios, en cualquier estado, y qué falta para publicar", async () => {
    const yo = await crearPrestador({ identidad: false });
    const otro = await crearPrestador();
    await crear(yo.token);
    await crear(otro.token);

    const respuesta = await request(app).get("/servicios/mios").set("Authorization", `Bearer ${yo.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.servicios).toHaveLength(1);
    expect(respuesta.body.servicios[0].estado).toBe("PAUSADO");
    expect(codigos(respuesta.body)).toEqual(["IDENTIDAD_NO_VERIFICADA"]);
  });
});

describe("GET /servicios/:id (público)", () => {
  async function servicioConCredenciales() {
    const prestador = await crearPrestador({ comunas: [SANTIAGO, LAS_CONDES] });
    const admin = await crearUsuario("ADMINISTRADOR");
    const identidad = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "IDENTIDAD" } });
    const sec = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "SEC_INSTALADOR_GAS" } });
    const consulta = new Date("2026-10-01T12:00:00Z");
    await prisma.credencial.createMany({
      data: [
        {
          prestadorId: prestador.perfilId,
          tipoId: identidad.id,
          identificadorDocumento: "no se muestra",
          estado: "VERIFICADA",
          metodo: "MANUAL",
          fechaConsulta: consulta,
          verificadoPorId: admin.id,
        },
        {
          prestadorId: prestador.perfilId,
          tipoId: sec.id,
          identificadorDocumento: "SEC-123",
          estado: "VERIFICADA",
          metodo: "AUTOMATICO",
          fechaConsulta: consulta,
        },
        // Una pendiente: no se muestra.
        { prestadorId: prestador.perfilId, tipoId: sec.id, identificadorDocumento: "SEC-999" },
      ],
    });
    const { body } = await crear(prestador.token);
    return { prestador, id: String(body.servicio.id) };
  }

  it("se ve sin sesión, con el prestador, sus comunas y sus credenciales verificadas", async () => {
    const { prestador, id } = await servicioConCredenciales();

    const respuesta = await request(app).get(`/servicios/${id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.servicio).toMatchObject({
      titulo: SERVICIO_VALIDO.titulo,
      prestador: { id: prestador.perfilId, nombre: prestador.nombre },
    });
    expect(respuesta.body.servicio.prestador.comunas.map((comuna: { nombre: string }) => comuna.nombre)).toEqual([
      "Las Condes",
      "Santiago",
    ]);
    expect(respuesta.body.servicio.prestador.credenciales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: "Cédula de identidad", acreditacion: "REVISADA_POR_LOCALCL" }),
        expect.objectContaining({
          tipo: "Instalador de gas autorizado (SEC)",
          emisor: "Superintendencia de Electricidad y Combustibles",
          acreditacion: "REGISTRO_OFICIAL",
          verificadaEn: "2026-10-01T12:00:00.000Z",
        }),
      ]),
    );
    expect(respuesta.body.servicio.prestador.credenciales).toHaveLength(2);
  });

  it("la vista pública no incluye teléfono, correo ni RUT", async () => {
    const { prestador, id } = await servicioConCredenciales();

    const respuesta = await request(app).get(`/servicios/${id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).not.toContain(TELEFONO);
    expect(respuesta.text).not.toContain(prestador.correo);
    expect(respuesta.text).not.toContain(String(prestador.rut));
    expect(respuesta.text).not.toMatch(/"(telefono|correo|rut|identificadorDocumento)"/);
    // Ni el identificador de la credencial, que para la identidad es el RUT.
    expect(respuesta.text).not.toContain("SEC-123");
  });

  it("un servicio pausado no es público: 404", async () => {
    const prestador = await crearPrestador({ identidad: false });
    const { body } = await crear(prestador.token);

    expect((await request(app).get(`/servicios/${body.servicio.id}`)).status).toBe(404);
  });
});

describe("PUT /prestadores/yo/comunas", () => {
  function definir(token: string, comunaIds: number[]) {
    return request(app).put("/prestadores/yo/comunas").set("Authorization", `Bearer ${token}`).send({ comunaIds });
  }

  it("define las comunas de atención y reemplaza las anteriores", async () => {
    const prestador = await crearPrestador({ comunas: [SANTIAGO] });

    const respuesta = await definir(prestador.token, [LAS_CONDES, 13123]);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.comunas.map((comuna: { id: number }) => comuna.id).sort()).toEqual([13114, 13123]);
    expect(await prisma.prestadorComuna.count({ where: { prestadorId: prestador.perfilId } })).toBe(2);
  });

  it.each([
    ["ninguna comuna", []],
    ["21 comunas", Array.from({ length: 21 }, (_, i) => 13101 + i)],
    ["una comuna inexistente", [SANTIAGO, 99999]],
    ["comunas repetidas", [SANTIAGO, SANTIAGO]],
  ])("%s: 400", async (_caso, comunaIds) => {
    const prestador = await crearPrestador({ comunas: [SANTIAGO] });

    const respuesta = await definir(prestador.token, comunaIds);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "comunaIds")).toBeDefined();
    // Un pedido inválido no deja al prestador sin comunas.
    expect(await prisma.prestadorComuna.count({ where: { prestadorId: prestador.perfilId } })).toBe(1);
  });

  it("un cliente no puede definir comunas de atención: 403", async () => {
    const cliente = await crearUsuario("CLIENTE");

    expect((await definir(cliente.token, [SANTIAGO])).status).toBe(403);
  });
});

describe("GET /prestadores/:id/contacto", () => {
  it("sin sesión: 401", async () => {
    const prestador = await crearPrestador();
    await crear(prestador.token);

    expect((await contacto(null, prestador.perfilId)).status).toBe(401);
    expect(await prisma.contacto.count()).toBe(0);
  });

  it("con sesión: entrega el teléfono y registra una fila en contactos", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearUsuario("CLIENTE");
    const { body } = await crear(prestador.token);

    const respuesta = await contacto(cliente.token, prestador.perfilId, body.servicio.id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.telefono).toBe(TELEFONO);
    expect(respuesta.headers["cache-control"]).toMatch(/no-store/);
    expect(await prisma.contacto.findMany()).toEqual([
      expect.objectContaining({
        clienteId: cliente.id,
        prestadorId: prestador.perfilId,
        servicioId: body.servicio.id,
        canal: "WHATSAPP",
      }),
    ]);
  });

  it("un ?id= en la consulta no reemplaza al prestador de la ruta", async () => {
    const prestador = await crearPrestador();
    const otro = await crearPrestador();
    const cliente = await crearUsuario("CLIENTE");
    await crear(prestador.token);
    await crear(otro.token);

    await request(app)
      .get(`/prestadores/${prestador.perfilId}/contacto?id=${otro.perfilId}`)
      .set("Authorization", `Bearer ${cliente.token}`);

    expect(await prisma.contacto.findMany()).toEqual([expect.objectContaining({ prestadorId: prestador.perfilId })]);
  });

  it("un prestador pidiendo su propio contacto: 400, sin registrar nada", async () => {
    const prestador = await crearPrestador();
    await crear(prestador.token);

    const respuesta = await contacto(prestador.token, prestador.perfilId);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("AUTOCONTACTO");
    expect(await prisma.contacto.count()).toBe(0);
  });

  it("un prestador sin servicios publicados no entrega su teléfono: 404", async () => {
    const prestador = await crearPrestador({ identidad: false });
    const cliente = await crearUsuario("CLIENTE");
    await crear(prestador.token);

    expect((await contacto(cliente.token, prestador.perfilId)).status).toBe(404);
    expect(await prisma.contacto.count()).toBe(0);
  });

  it("con un servicio que no es de ese prestador: 400", async () => {
    const prestador = await crearPrestador();
    const otro = await crearPrestador();
    const cliente = await crearUsuario("CLIENTE");
    await crear(prestador.token);
    const { body } = await crear(otro.token);

    const respuesta = await contacto(cliente.token, prestador.perfilId, body.servicio.id);

    expect(respuesta.status).toBe(400);
    expect(await prisma.contacto.count()).toBe(0);
  });
});

describe("GET /categorias", () => {
  it("es pública y lista las activas en orden", async () => {
    const respuesta = await request(app).get("/categorias");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.categorias.map((categoria: { slug: string }) => categoria.slug)).toEqual([
      "gasfiteria",
      "electricidad",
      "banqueteria",
      "soldadura",
      "carpinteria",
      "cerrajeria",
    ]);
  });
});
