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
  it("crea un cliente y responde 202 sin devolver dato alguno de la cuenta", async () => {
    const respuesta = await request(app).post("/auth/registro").send(registroValido);

    expect(respuesta.status).toBe(202);
    // El cuerpo no puede traer el usuario: devolverlo solo cuando la cuenta se
    // crea delataría igual qué correos ya están registrados.
    expect(respuesta.body).not.toHaveProperty("usuario");

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: registroValido.correo },
      select: { nombre: true, rol: true, correoVerificado: true },
    });

    expect(usuario.nombre).toBe("Ana Pérez");
    expect(usuario.rol).toBe("CLIENTE");
    expect(usuario.correoVerificado).toBe(false);
  });

  it("guarda la contraseña hasheada con Argon2id", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { hashContrasena: true },
    });

    expect(usuario?.hashContrasena).toMatch(/^\$argon2id\$/);
  });

  it("ante un correo duplicado responde exactamente lo mismo y no crea cuenta", async () => {
    const primera = await request(app).post("/auth/registro").send(registroValido);

    const segunda = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, correo: "ANA.PEREZ@Ejemplo.CL" });

    // Idénticas: el formulario de registro ya no sirve para averiguar quién
    // tiene cuenta en la plataforma.
    expect(segunda.status).toBe(primera.status);
    expect(segunda.body).toEqual(primera.body);
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

  it("responde 400 cuando la contraseña contiene el correo", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, contrasena: "ana.perez-2026-clave" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "contrasena" }),
    );
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("responde 400 cuando la contraseña contiene el nombre", async () => {
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, contrasena: "mi-clave-perez-2026" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toContainEqual(
      expect.objectContaining({ campo: "contrasena" }),
    );
  });

  it("acepta una frase larga en minúsculas, sin exigir composición", async () => {
    // No se piden mayúsculas ni símbolos: empujan a patrones predecibles.
    const respuesta = await request(app)
      .post("/auth/registro")
      .send({ ...registroValido, contrasena: "tres tristes tigres comian trigo" });

    expect(respuesta.status).toBe(202);
    expect(await prisma.usuario.count()).toBe(1);
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

    expect(respuesta.status).toBe(202);

    const usuario = await prisma.usuario.findUnique({
      where: { correo: registroValido.correo },
      select: { rol: true },
    });

    expect(usuario?.rol).toBe("CLIENTE");
  });
});
