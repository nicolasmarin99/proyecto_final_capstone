import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";

const registroValido = {
  nombre: "Ana Pérez",
  correo: "ana.perez@ejemplo.cl",
  contrasena: "contrasena-segura-123",
};

// Cada prueba parte de una base limpia, así ninguna depende del orden
// en que Vitest las ejecute ni de lo que haya dejado la anterior.
beforeEach(async () => {
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("POST /auth/registro", () => {
  it("crea un cliente, responde 201 y no expone el hash de la contraseña", async () => {
    const respuesta = await request(app).post("/auth/registro").send(registroValido);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.usuario.correo).toBe("ana.perez@ejemplo.cl");
    expect(respuesta.body.usuario.nombre).toBe("Ana Pérez");
    expect(respuesta.body.usuario.rol).toBe("CLIENTE");
    expect(respuesta.body.usuario).not.toHaveProperty("hashContrasena");
  });

  it("guarda la contraseña hasheada con Argon2id", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { hashContrasena: true },
    });

    expect(usuario?.hashContrasena).toMatch(/^\$argon2id\$/);
  });

  it("responde 409 ante un correo duplicado escrito con otras mayúsculas", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, correo: "ANA.PEREZ@Ejemplo.CL" });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("REGISTRO_NO_DISPONIBLE");
    expect(await prisma.usuario.count()).toBe(1);
  });

  it("responde 400 con detalle en contrasena cuando tiene 9 caracteres", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, contrasena: "123456789" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "contrasena" }),
    );
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("responde 400 cuando la contraseña tiene 129 caracteres", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, contrasena: "a".repeat(129) });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "contrasena" }),
    );
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("responde 400 cuando faltan campos obligatorios", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ correo: "ana.perez@ejemplo.cl" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("responde 400 cuando el cuerpo no es JSON válido", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .set("Content-Type", "application/json")
      .send('{"nombre": "Ana",');

    expect(respuesta.status).toBe(400);
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("ignora el rol enviado por el cliente y crea siempre un CLIENTE", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, rol: "ADMINISTRADOR" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.usuario.rol).toBe("CLIENTE");

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { rol: true },
    });

    expect(usuario?.rol).toBe("CLIENTE");
  });
});
