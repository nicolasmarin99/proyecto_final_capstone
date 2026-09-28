import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { bandeja } from "../bandeja.js";

const registroValido = {
  nombre: "Pedro Soto",
  correo: "pedro.soto@ejemplo.cl",
  contrasena: "contrasena-segura-123",
  rut: "12.345.678-5",
};

const publicacion = { titulo: "Instalación eléctrica domiciliaria" };

function tokenDelCorreo(cuerpo: string): string {
  const encontrado = /token=([A-Za-z0-9_%-]+)/.exec(cuerpo);

  if (!encontrado?.[1]) {
    throw new Error("El correo no trae un enlace con token.");
  }

  return decodeURIComponent(encontrado[1]);
}

async function registrarEIniciarSesion(): Promise<string> {
  await request(app).post("/auth/registro-prestador").send(registroValido);

  const login = await request(app)
    .post("/auth/login")
    .send({ correo: registroValido.correo, contrasena: registroValido.contrasena });

  expect(login.status).toBe(200);

  return String(login.body.accessToken);
}

async function verificarCorreo(): Promise<void> {
  const correo = bandeja().ultimoPara(registroValido.correo);

  if (!correo) {
    throw new Error("No se envió el correo de verificación.");
  }

  const respuesta = await request(app)
    .post("/auth/verificar-correo")
    .send({ token: tokenDelCorreo(correo.cuerpo) });

  expect(respuesta.status).toBe(200);
}

beforeEach(async () => {
  await prisma.usuario.deleteMany();
  bandeja().vaciar();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("POST /servicios (protegido por exigirCorreoVerificado)", () => {
  it("responde 403 a una sesión válida cuyo correo no está verificado", async () => {
    const token = await registrarEIniciarSesion();

    const respuesta = await request(app)
      .post("/servicios")
      .set("Authorization", `Bearer ${token}`)
      .send(publicacion);

    // 403 y no 401: la sesión es legítima, lo que falta es un paso de la
    // cuenta. Con 401 la web intentaría refrescar el token, que no arregla nada.
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CORREO_NO_VERIFICADO");
  });

  it("responde 201 una vez confirmado el correo, con el mismo token de acceso", async () => {
    const token = await registrarEIniciarSesion();
    await verificarCorreo();

    const respuesta = await request(app)
      .post("/servicios")
      .set("Authorization", `Bearer ${token}`)
      .send(publicacion);

    // El mismo token que antes daba 403 ahora sirve: el estado se lee de la
    // base, así que verificar surte efecto sin esperar a que el token venza.
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.servicio.titulo).toBe(publicacion.titulo);
  });

  it("responde 401 sin token, antes de mirar la verificación", async () => {
    const respuesta = await request(app).post("/servicios").send(publicacion);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("valida el cuerpo después de comprobar la verificación", async () => {
    const token = await registrarEIniciarSesion();
    await verificarCorreo();

    const respuesta = await request(app)
      .post("/servicios")
      .set("Authorization", `Bearer ${token}`)
      .send({ titulo: "no" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});
