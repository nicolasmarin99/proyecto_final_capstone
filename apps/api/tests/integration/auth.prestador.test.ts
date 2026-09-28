import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";

// 12.345.678-5 es un RUT con dígito verificador correcto.
const registroValido = {
  nombre: "Pedro Soto",
  correo: "pedro.soto@ejemplo.cl",
  contrasena: "contrasena-segura-123",
  rut: "12.345.678-5",
};

function registrarPrestador(cuerpo: Record<string, unknown>) {
  return request(app).post("/auth/registro-prestador").send(cuerpo);
}

beforeEach(async () => {
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("POST /auth/registro-prestador", () => {
  it("crea un prestador con el RUT normalizado y sin acreditar", async () => {
    const respuesta = await registrarPrestador(registroValido);

    expect(respuesta.status).toBe(202);
    expect(respuesta.body).not.toHaveProperty("usuario");

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: registroValido.correo },
      select: { rol: true, rut: true, rutVerificado: true, correoVerificado: true },
    });

    expect(usuario.rol).toBe("PRESTADOR");
    expect(usuario.rut).toBe("12345678-5");
    expect(usuario.rutVerificado).toBe(false);
    expect(usuario.correoVerificado).toBe(false);
  });

  it("guarda el RUT normalizado en la base aunque venga con puntos", async () => {
    await registrarPrestador(registroValido);

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { rut: true, rol: true, rutVerificado: true, hashContrasena: true },
    });

    expect(usuario?.rut).toBe("12345678-5");
    expect(usuario?.rol).toBe("PRESTADOR");
    expect(usuario?.rutVerificado).toBe(false);
    expect(usuario?.hashContrasena).toMatch(/^\$argon2id\$/);
  });

  it("no crea una segunda cuenta cuando el mismo RUT se envía con otro formato", async () => {
    const primera = await registrarPrestador(registroValido);

    const respuesta = await registrarPrestador({
      ...registroValido,
      correo: "otro.correo@ejemplo.cl",
      rut: "123456785",
    });

    expect(respuesta.status).toBe(primera.status);
    expect(respuesta.body).toEqual(primera.body);
    expect(await prisma.usuario.count()).toBe(1);
  });

  it("responde lo mismo ante correo duplicado, RUT duplicado y registro nuevo", async () => {
    const registroNuevo = await registrarPrestador(registroValido);

    const rutDuplicado = await registrarPrestador({
      ...registroValido,
      correo: "otro.correo@ejemplo.cl",
      rut: "12.345.678-5",
    });

    const correoDuplicado = await registrarPrestador({
      ...registroValido,
      rut: "7.654.321-6",
    });

    // Los tres caminos son indistinguibles desde fuera: no se puede deducir si
    // chocó el correo, si chocó el RUT, ni si se creó la cuenta.
    expect(rutDuplicado.status).toBe(registroNuevo.status);
    expect(correoDuplicado.status).toBe(registroNuevo.status);
    expect(rutDuplicado.body).toEqual(registroNuevo.body);
    expect(correoDuplicado.body).toEqual(registroNuevo.body);
    expect(await prisma.usuario.count()).toBe(1);
  });

  it("responde 400 con detalle en rut cuando el dígito verificador es incorrecto", async () => {
    const respuesta = await registrarPrestador({ ...registroValido, rut: "12.345.678-9" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "rut" }),
    );
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("responde 400 cuando el rut tiene un formato inválido", async () => {
    const respuesta = await registrarPrestador({ ...registroValido, rut: "no-es-un-rut" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "rut" }),
    );
  });

  it("responde 400 cuando falta el rut", async () => {
    const { rut: _rut, ...sinRut } = registroValido;
    const respuesta = await registrarPrestador(sinRut);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "rut" }),
    );
  });

  it("aplica las mismas reglas de contraseña que el registro de clientes", async () => {
    const respuesta = await registrarPrestador({ ...registroValido, contrasena: "123456789" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "contrasena" }),
    );
  });

  it("ignora el rol enviado por el cliente y crea siempre un PRESTADOR", async () => {
    const respuesta = await registrarPrestador({ ...registroValido, rol: "ADMINISTRADOR" });

    expect(respuesta.status).toBe(202);

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { rol: true },
    });

    expect(usuario?.rol).toBe("PRESTADOR");
  });

  it("no permite que un prestador pise el correo de un cliente ya registrado", async () => {
    await request(app).post("/auth/registro").send({
      nombre: "Ana Cliente",
      correo: registroValido.correo,
      contrasena: "contrasena-segura-123",
    });

    await registrarPrestador(registroValido);

    // La cuenta original queda intacta: sigue siendo la del cliente.
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: registroValido.correo },
      select: { rol: true, nombre: true },
    });

    expect(usuario.rol).toBe("CLIENTE");
    expect(usuario.nombre).toBe("Ana Cliente");
    expect(await prisma.usuario.count()).toBe(1);
  });
});
