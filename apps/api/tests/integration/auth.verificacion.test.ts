import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { TipoToken } from "../../src/generated/prisma/client.js";
import { hashearToken } from "../../src/shared/tokens.js";
import { bandeja } from "../bandeja.js";

const registroValido = {
  nombre: "Ana Pérez",
  correo: "ana.perez@ejemplo.cl",
  contrasena: "contrasena-segura-123",
};

/** Saca el token del enlace que viaja en el cuerpo del correo. */
function tokenDelCorreo(cuerpo: string): string {
  const encontrado = /token=([A-Za-z0-9_%-]+)/.exec(cuerpo);

  if (!encontrado?.[1]) {
    throw new Error("El correo no trae un enlace con token.");
  }

  return decodeURIComponent(encontrado[1]);
}

async function registrarYObtenerToken(): Promise<string> {
  await request(app).post("/auth/registro").send(registroValido);

  const correo = bandeja().ultimoPara(registroValido.correo);

  if (!correo) {
    throw new Error("No se envió el correo de verificación.");
  }

  return tokenDelCorreo(correo.cuerpo);
}

beforeEach(async () => {
  await prisma.usuario.deleteMany();
  bandeja().vaciar();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("Correo de verificación al registrarse", () => {
  it("envía el enlace y deja la cuenta sin verificar", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const correo = bandeja().ultimoPara(registroValido.correo);

    expect(correo?.asunto).toContain("Confirma tu correo");
    expect(correo?.cuerpo).toContain("/verificar-correo?token=");

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: registroValido.correo },
      select: { correoVerificado: true },
    });

    expect(usuario.correoVerificado).toBe(false);
  });

  it("guarda el token hasheado, nunca en claro", async () => {
    const token = await registrarYObtenerToken();

    const guardado = await prisma.tokenCuenta.findUniqueOrThrow({
      where: { hashToken: hashearToken(token) },
      select: { tipo: true, usadoEn: true },
    });

    expect(guardado.tipo).toBe(TipoToken.VERIFICACION_CORREO);
    expect(guardado.usadoEn).toBeNull();
    // El valor en claro no puede estar en ninguna fila.
    expect(await prisma.tokenCuenta.count({ where: { hashToken: token } })).toBe(0);
  });

  it("el registro de prestador también envía el enlace", async () => {
    await request(app).post("/auth/registro-prestador").send({
      nombre: "Pedro Soto",
      correo: "pedro.soto@ejemplo.cl",
      contrasena: "contrasena-segura-123",
      rut: "12.345.678-5",
    });

    expect(bandeja().ultimoPara("pedro.soto@ejemplo.cl")?.cuerpo).toContain(
      "/verificar-correo?token=",
    );
  });

  it("ante un correo ya registrado avisa al dueño y no crea cuenta", async () => {
    await request(app).post("/auth/registro").send(registroValido);
    bandeja().vaciar();

    await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, nombre: "Impostor" });

    const aviso = bandeja().ultimoPara(registroValido.correo);

    expect(aviso?.asunto).toContain("Alguien intentó registrarse");
    // Crucial: el aviso no autoriza nada, así que no puede llevar token.
    expect(aviso?.cuerpo).not.toContain("token=");
    expect(await prisma.usuario.count()).toBe(1);
  });
});

describe("POST /auth/verificar-correo", () => {
  it("marca el correo como verificado con un token válido", async () => {
    const token = await registrarYObtenerToken();

    const respuesta = await request(app).post("/auth/verificar-correo").send({ token });

    expect(respuesta.status).toBe(200);

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: registroValido.correo },
      select: { correoVerificado: true },
    });

    expect(usuario.correoVerificado).toBe(true);
  });

  it("rechaza un token ya usado con el mismo error genérico", async () => {
    const token = await registrarYObtenerToken();
    await request(app).post("/auth/verificar-correo").send({ token });

    const segunda = await request(app).post("/auth/verificar-correo").send({ token });

    expect(segunda.status).toBe(400);
    expect(segunda.body.error.codigo).toBe("ENLACE_INVALIDO");
  });

  it("rechaza un token vencido", async () => {
    const token = await registrarYObtenerToken();

    await prisma.tokenCuenta.update({
      where: { hashToken: hashearToken(token) },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });

    const respuesta = await request(app).post("/auth/verificar-correo").send({ token });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("ENLACE_INVALIDO");
  });

  it("rechaza un token inventado con la misma respuesta que uno vencido", async () => {
    const token = await registrarYObtenerToken();

    await prisma.tokenCuenta.update({
      where: { hashToken: hashearToken(token) },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });

    const vencido = await request(app).post("/auth/verificar-correo").send({ token });
    const inventado = await request(app)
      .post("/auth/verificar-correo")
      .send({ token: "token-que-nunca-existio" });

    expect(inventado.status).toBe(vencido.status);
    expect(inventado.body).toEqual(vencido.body);
  });

  it("un token de verificación no sirve para otro propósito", async () => {
    const token = await registrarYObtenerToken();

    // Se cambia el tipo de la fila: el canje filtra por tipo, así que el mismo
    // hash deja de encontrarse desde el endpoint de verificación.
    await prisma.tokenCuenta.update({
      where: { hashToken: hashearToken(token) },
      data: { tipo: TipoToken.RECUPERACION_CONTRASENA },
    });

    const respuesta = await request(app).post("/auth/verificar-correo").send({ token });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("ENLACE_INVALIDO");
  });
});

describe("POST /auth/reenviar-verificacion", () => {
  it("responde igual para un correo registrado que para uno inexistente", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const registrado = await request(app)
      .post("/auth/reenviar-verificacion")
      .send({ correo: registroValido.correo });

    const inexistente = await request(app)
      .post("/auth/reenviar-verificacion")
      .send({ correo: "nadie@ejemplo.cl" });

    expect(registrado.status).toBe(inexistente.status);
    expect(registrado.body).toEqual(inexistente.body);
  });

  it("frena los reenvíos seguidos", async () => {
    await request(app).post("/auth/registro").send(registroValido);
    bandeja().vaciar();

    await request(app)
      .post("/auth/reenviar-verificacion")
      .send({ correo: registroValido.correo });

    // El token recién emitido en el registro está dentro de la ventana de
    // espera, así que no debe salir otro correo.
    expect(bandeja().paraDireccion(registroValido.correo)).toHaveLength(0);
  });

  it("reenvía cuando ya pasó la ventana de espera, e invalida el enlace anterior", async () => {
    const tokenOriginal = await registrarYObtenerToken();

    await prisma.tokenCuenta.updateMany({
      data: { creadoEn: new Date(Date.now() - 10 * 60 * 1000) },
    });
    bandeja().vaciar();

    await request(app)
      .post("/auth/reenviar-verificacion")
      .send({ correo: registroValido.correo });

    expect(bandeja().paraDireccion(registroValido.correo)).toHaveLength(1);

    const conElViejo = await request(app)
      .post("/auth/verificar-correo")
      .send({ token: tokenOriginal });

    expect(conElViejo.status).toBe(400);
  });

  it("no reenvía a una cuenta que ya verificó su correo", async () => {
    const token = await registrarYObtenerToken();
    await request(app).post("/auth/verificar-correo").send({ token });

    await prisma.tokenCuenta.updateMany({
      data: { creadoEn: new Date(Date.now() - 10 * 60 * 1000) },
    });
    bandeja().vaciar();

    await request(app)
      .post("/auth/reenviar-verificacion")
      .send({ correo: registroValido.correo });

    expect(bandeja().paraDireccion(registroValido.correo)).toHaveLength(0);
  });
});
