import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { Rol } from "../../src/generated/prisma/client.js";

const CONTRASENA = "contrasena-segura-123";

async function crearUsuario(correo: string, rol: Rol, activo = true) {
  return prisma.usuario.create({
    data: {
      correo,
      nombre: `Usuario ${rol}`,
      rol,
      activo,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
    select: { id: true },
  });
}

/** Token obtenido por el flujo real de login, no firmado a mano. */
async function tokenDe(correo: string) {
  const respuesta = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });

  expect(respuesta.status).toBe(200);

  return String(respuesta.body.accessToken);
}

function pedirResumen(token?: string) {
  const peticion = request(app).get("/admin/resumen");

  return token ? peticion.set("Authorization", `Bearer ${token}`) : peticion;
}

beforeEach(async () => {
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("GET /admin/resumen", () => {
  it("responde 200 con los contadores por rol a un administrador", async () => {
    await crearUsuario("admin@ejemplo.cl", Rol.ADMINISTRADOR);
    await crearUsuario("cliente1@ejemplo.cl", Rol.CLIENTE);
    await crearUsuario("cliente2@ejemplo.cl", Rol.CLIENTE);
    await crearUsuario("prestador@ejemplo.cl", Rol.PRESTADOR);

    const respuesta = await pedirResumen(await tokenDe("admin@ejemplo.cl"));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen).toEqual({
      totalUsuarios: 4,
      porRol: { CLIENTE: 2, PRESTADOR: 1, ADMINISTRADOR: 1 },
    });
  });

  it("incluye los roles sin usuarios como cero", async () => {
    await crearUsuario("admin@ejemplo.cl", Rol.ADMINISTRADOR);

    const respuesta = await pedirResumen(await tokenDe("admin@ejemplo.cl"));

    expect(respuesta.body.resumen).toEqual({
      totalUsuarios: 1,
      porRol: { CLIENTE: 0, PRESTADOR: 0, ADMINISTRADOR: 1 },
    });
  });

  it("responde 403 a un cliente autenticado", async () => {
    await crearUsuario("cliente@ejemplo.cl", Rol.CLIENTE);

    const respuesta = await pedirResumen(await tokenDe("cliente@ejemplo.cl"));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISOS");
  });

  it("responde 403 a un prestador autenticado", async () => {
    await crearUsuario("prestador@ejemplo.cl", Rol.PRESTADOR);

    const respuesta = await pedirResumen(await tokenDe("prestador@ejemplo.cl"));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISOS");
  });

  it("responde 401 sin token", async () => {
    const respuesta = await pedirResumen();

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("responde 403 si el rol cambió en la base después de emitir el token", async () => {
    // El token sigue diciendo ADMINISTRADOR y su firma es válida. Lo que manda
    // es la fila de la base, así que la degradación tiene efecto inmediato sin
    // esperar a que venza el token.
    const usuario = await crearUsuario("admin@ejemplo.cl", Rol.ADMINISTRADOR);
    const token = await tokenDe("admin@ejemplo.cl");

    await prisma.usuario.update({ where: { id: usuario.id }, data: { rol: Rol.CLIENTE } });

    const respuesta = await pedirResumen(token);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISOS");
  });

  it("responde 401 si la cuenta fue suspendida después de emitir el token", async () => {
    const usuario = await crearUsuario("admin@ejemplo.cl", Rol.ADMINISTRADOR);
    const token = await tokenDe("admin@ejemplo.cl");

    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    const respuesta = await pedirResumen(token);

    // Suspendido es 401 y no 403: el problema no es que le falten permisos,
    // es que esa sesión ya no representa a una cuenta válida.
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("NO_AUTENTICADO");
  });

  it("responde 401 si la cuenta fue eliminada después de emitir el token", async () => {
    const usuario = await crearUsuario("admin@ejemplo.cl", Rol.ADMINISTRADOR);
    const token = await tokenDe("admin@ejemplo.cl");

    await prisma.usuario.delete({ where: { id: usuario.id } });

    const respuesta = await pedirResumen(token);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("NO_AUTENTICADO");
  });
});
