import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { verificarAccessToken } from "../../src/shared/jwt.js";
import { bandeja } from "../bandeja.js";

/*
  Una persona con cuenta de cliente quiere ofrecer servicios con el MISMO
  correo: su cuenta pasa a ser de prestador (POST /auth/convertir-en-prestador).
  Una persona, una cuenta, con todo su historial.
*/

const CONTRASENA = "contrasena-segura-123";
const RUT = "12345678-5";

async function vaciar() {
  // TRUNCATE: las bitácoras rechazan DELETE.
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
  bandeja().vaciar();
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});
beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; rut?: string | null; nombre?: string } = {}) {
  secuencia += 1;
  const correo = `conversion${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: opciones.nombre ?? `Persona ${secuencia}`,
      rol,
      rut: opciones.rut ?? null,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

function convertir(token: string | null, cuerpo: object = { rut: "12.345.678-5" }) {
  const solicitud = request(app).post("/auth/convertir-en-prestador");
  return token ? solicitud.set("Authorization", `Bearer ${token}`).send(cuerpo) : solicitud.send(cuerpo);
}

/** Un prestador con un servicio publicado, para contactar y valorar. */
async function prestadorConServicio(nombre = "Electricista Ejemplo") {
  const prestador = await crearUsuario("PRESTADOR", { rut: `${30000000 + secuencia}-K`, nombre });
  const perfil = await prisma.perfilPrestador.create({
    data: { usuarioId: prestador.id, comunaId: 13101, telefono: "+56912345678", comunasAtencion: { create: [{ comunaId: 13101 }] } },
  });
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "electricidad" } });
  const servicio = await prisma.servicio.create({
    data: { prestadorId: perfil.id, categoriaId: categoria.id, titulo: "Instalación de enchufes", descripcion: "Trabajo limpio y garantizado.", estado: "PUBLICADO" },
  });
  return { ...prestador, perfilId: perfil.id, servicioId: servicio.id };
}

describe("POST /auth/convertir-en-prestador", () => {
  it("un cliente pasa a ser prestador con el mismo correo: la misma cuenta, con su RUT sin verificar y un token nuevo", async () => {
    const cliente = await crearUsuario("CLIENTE", { nombre: "Ana Rojas" });

    const respuesta = await convertir(cliente.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuario).toMatchObject({ id: cliente.id, correo: cliente.correo, nombre: "Ana Rojas", rol: "PRESTADOR", rut: RUT, rutVerificado: false });
    expect(respuesta.body.usuario).not.toHaveProperty("hashContrasena");
    expect(verificarAccessToken(String(respuesta.body.accessToken))).toMatchObject({ sub: cliente.id, rol: "PRESTADOR" });
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).toMatchObject({ rol: "PRESTADOR", rut: RUT, rutVerificado: false });
  });

  it("con su token nuevo entra a las rutas de prestador (todavía sin perfil), y sigue entrando con la misma contraseña", async () => {
    const cliente = await crearUsuario("CLIENTE");
    const comoCliente = await request(app).get("/prestadores/yo").set("Authorization", `Bearer ${cliente.token}`);

    const { body } = await convertir(cliente.token);
    const comoPrestador = await request(app).get("/prestadores/yo").set("Authorization", `Bearer ${String(body.accessToken)}`);
    const login = await request(app).post("/auth/login").send({ correo: cliente.correo, contrasena: CONTRASENA });

    // Como cliente le estaba prohibida (403). Ahora entra: responde que aún no
    // tiene perfil de prestador (404), que completa en su área.
    expect(comoCliente.status).toBe(403);
    expect(comoPrestador.status).toBe(404);
    expect(login.status).toBe(200);
    expect(login.body.usuario.rol).toBe("PRESTADOR");
  });

  it("conserva su historial: los contactos que hizo y las valoraciones que publicó siguen siendo suyos", async () => {
    const cliente = await crearUsuario("CLIENTE");
    const electricista = await prestadorConServicio();
    const contacto = await prisma.contacto.create({
      data: { clienteId: cliente.id, prestadorId: electricista.perfilId, servicioId: electricista.servicioId, canal: "WHATSAPP" },
    });
    const valorada = await request(app)
      .post(`/servicios/${electricista.servicioId}/valoraciones`)
      .set("Authorization", `Bearer ${cliente.token}`)
      .send({ calificacion: 5, comentario: "Dejó todo funcionando, muy ordenado." });
    expect(valorada.status).toBe(201);

    await convertir(cliente.token);

    expect(await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } })).toMatchObject({ clienteId: cliente.id });
    expect(await prisma.valoracion.count({ where: { clienteId: cliente.id } })).toBe(1);
  });

  it("como prestador puede valorar el servicio de OTRO prestador que contrató, con las mismas reglas", async () => {
    const cliente = await crearUsuario("CLIENTE");
    const electricista = await prestadorConServicio();
    const { body } = await convertir(cliente.token);
    const token = String(body.accessToken);
    await prisma.contacto.create({
      data: { clienteId: cliente.id, prestadorId: electricista.perfilId, servicioId: electricista.servicioId, canal: "WHATSAPP" },
    });

    const mia = await request(app).get(`/servicios/${electricista.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${token}`);
    const valorada = await request(app)
      .post(`/servicios/${electricista.servicioId}/valoraciones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ calificacion: 4, comentario: "Llegó a la hora y explicó todo." });

    expect(mia.status).toBe(200);
    expect(mia.body.puedeValorar).toBe(true);
    expect(valorada.status).toBe(201);
  });

  it("un prestador que mira su propio servicio recibe motivo PROPIO: no se le ofrece valorarlo", async () => {
    const prestador = await prestadorConServicio();

    const respuesta = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ valoracion: null, puedeValorar: false, motivo: "PROPIO", plazoHasta: null });
  });

  it("un prestador sin contacto con ese servicio no lo puede valorar (403), igual que un cliente", async () => {
    const gasfiter = await prestadorConServicio("Gasfíter Ejemplo");
    const electricista = await prestadorConServicio();

    const respuesta = await request(app)
      .post(`/servicios/${electricista.servicioId}/valoraciones`)
      .set("Authorization", `Bearer ${gasfiter.token}`)
      .send({ calificacion: 1 });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_CONTACTO");
  });

  it("un prestador nunca valora su propio servicio (403 AUTOVALORACION), aunque tenga un contacto consigo mismo", async () => {
    const prestador = await prestadorConServicio();
    await prisma.contacto.create({
      data: { clienteId: prestador.id, prestadorId: prestador.perfilId, servicioId: prestador.servicioId, canal: "WHATSAPP" },
    });

    const respuesta = await request(app)
      .post(`/servicios/${prestador.servicioId}/valoraciones`)
      .set("Authorization", `Bearer ${prestador.token}`)
      .send({ calificacion: 5 });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("AUTOVALORACION");
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("si el RUT ya pertenece a otra cuenta: 409 en el campo, y la cuenta sigue siendo de cliente", async () => {
    await crearUsuario("PRESTADOR", { rut: RUT });
    const cliente = await crearUsuario("CLIENTE");

    const respuesta = await convertir(cliente.token);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("RUT_EN_USO");
    expect(respuesta.body.error.detalles).toEqual([expect.objectContaining({ campo: "rut" })]);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).toMatchObject({ rol: "CLIENTE", rut: null });
  });

  it.each([
    ["RUT mal formado", { rut: "12345678-0" }],
    ["sin RUT", {}],
  ])("%s: 400 y nada cambia", async (_caso, cuerpo) => {
    const cliente = await crearUsuario("CLIENTE");

    const respuesta = await convertir(cliente.token, cuerpo);

    expect(respuesta.status).toBe(400);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).rol).toBe("CLIENTE");
  });

  it("el rol lo fija el servidor: un «rol» o «rutVerificado» en el cuerpo se ignoran", async () => {
    const cliente = await crearUsuario("CLIENTE");

    const respuesta = await convertir(cliente.token, { rut: "12.345.678-5", rol: "ADMINISTRADOR", rutVerificado: true });

    expect(respuesta.status).toBe(200);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).toMatchObject({ rol: "PRESTADOR", rutVerificado: false });
  });

  it("solo un cliente con sesión y el correo confirmado: sin sesión 401, sin correo confirmado 403", async () => {
    const sinConfirmar = await crearUsuario("CLIENTE", { correoVerificado: false });

    expect((await convertir(null)).status).toBe(401);
    expect((await convertir(sinConfirmar.token)).status).toBe(403);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: sinConfirmar.id } })).rol).toBe("CLIENTE");
  });

  it("un prestador o un administrador no se «convierten» (403): ni cambia el rol ni el RUT", async () => {
    const prestador = await crearUsuario("PRESTADOR", { rut: "11111111-1" });
    const administrador = await crearUsuario("ADMINISTRADOR");

    expect((await convertir(prestador.token, { rut: "22.222.222-2" })).status).toBe(403);
    expect((await convertir(administrador.token)).status).toBe(403);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: prestador.id } })).toMatchObject({ rol: "PRESTADOR", rut: "11111111-1" });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: administrador.id } })).rol).toBe("ADMINISTRADOR");
  });

  it("una segunda conversión ya no encuentra un cliente: 403, nada se duplica", async () => {
    const cliente = await crearUsuario("CLIENTE");
    expect((await convertir(cliente.token)).status).toBe(200);

    // El token viejo sigue vivo, pero autorizar() lee el rol desde la base.
    const repetida = await convertir(cliente.token, { rut: "22.222.222-2" });

    expect(repetida.status).toBe(403);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).rut).toBe(RUT);
  });
});

describe("Registrarse otra vez con el mismo correo", () => {
  it("registrarse como prestador con el correo de un cliente no crea otra cuenta, responde igual y le explica cómo convertirla", async () => {
    const cliente = await crearUsuario("CLIENTE");
    const nueva = { nombre: "Persona Repetida", correo: cliente.correo, contrasena: "otra-contrasena-segura-456", rut: "12.345.678-5" };
    const desconocida = { ...nueva, correo: "nadie-registrado@ejemplo.cl", rut: "22.222.222-2" };

    const repetida = await request(app).post("/auth/registro-prestador").send(nueva);
    const deVerdadNueva = await request(app).post("/auth/registro-prestador").send(desconocida);

    // Mismo estado y mismo cuerpo: el registro no revela qué correos tienen cuenta.
    expect(repetida.status).toBe(deVerdadNueva.status);
    expect(repetida.body).toEqual(deVerdadNueva.body);
    expect(await prisma.usuario.count({ where: { correo: cliente.correo } })).toBe(1);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.id } })).rol).toBe("CLIENTE");
    const aviso = bandeja().ultimoPara(cliente.correo);
    expect(aviso?.cuerpo).toContain("Quiero ofrecer mis servicios");
    expect(aviso?.cuerpo).toContain("no necesitas otra cuenta");
  });
});
