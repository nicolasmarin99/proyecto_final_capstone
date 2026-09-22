import { Algorithm, hash } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { env } from "../../src/env.js";

const NOMBRE_COOKIE = "lc_refresh";

const credenciales = {
  correo: "ana.perez@ejemplo.cl",
  contrasena: "contrasena-segura-123",
};

const registroValido = { nombre: "Ana Pérez", ...credenciales };

/** set-cookie llega como arreglo; se normaliza sin recurrir a any. */
function cookiesDe(respuesta: request.Response): string[] {
  const cabecera: unknown = respuesta.headers["set-cookie"];

  if (Array.isArray(cabecera)) {
    return cabecera.filter((valor): valor is string => typeof valor === "string");
  }

  return typeof cabecera === "string" ? [cabecera] : [];
}

function cookieRefrescoCompleta(respuesta: request.Response): string {
  const cookie = cookiesDe(respuesta).find((valor) => valor.startsWith(`${NOMBRE_COOKIE}=`));

  if (!cookie) {
    throw new Error("La respuesta no trae la cookie de refresco.");
  }

  return cookie;
}

/** Solo el par nombre=valor, que es lo que reenvía un navegador. */
function cookieParaEnviar(respuesta: request.Response): string {
  return cookieRefrescoCompleta(respuesta).split(";")[0] ?? "";
}

async function registrarYAutenticar() {
  await request(app).post("/auth/registro").send(registroValido);
  const respuesta = await request(app).post("/auth/login").send(credenciales);

  return respuesta;
}

beforeEach(async () => {
  // Las sesiones caen por cascada al borrar el usuario.
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

describe("POST /auth/login", () => {
  it("responde 200 con token de acceso y cookie de refresco protegida", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const respuesta = await request(app).post("/auth/login").send(credenciales);

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.accessToken).toBe("string");
    expect(respuesta.body.usuario.correo).toBe(credenciales.correo);
    expect(respuesta.body.usuario.rol).toBe("CLIENTE");
    expect(respuesta.body.usuario).not.toHaveProperty("hashContrasena");

    const cookie = cookieRefrescoCompleta(respuesta);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
  });

  it("normaliza el correo igual que el registro", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const respuesta = await request(app)
      .post("/auth/login")
      .send({ ...credenciales, correo: "  ANA.PEREZ@Ejemplo.CL  " });

    expect(respuesta.status).toBe(200);
  });

  it("responde lo mismo ante contraseña incorrecta que ante correo inexistente", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    const contrasenaMala = await request(app)
      .post("/auth/login")
      .send({ ...credenciales, contrasena: "contrasena-equivocada" });

    const correoInexistente = await request(app)
      .post("/auth/login")
      .send({ correo: "nadie@ejemplo.cl", contrasena: "contrasena-segura-123" });

    expect(contrasenaMala.status).toBe(401);
    expect(correoInexistente.status).toBe(401);
    expect(contrasenaMala.body).toEqual(correoInexistente.body);
    expect(contrasenaMala.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("responde 401 a un usuario inactivo", async () => {
    await request(app).post("/auth/registro").send(registroValido);
    await prisma.usuario.update({
      where: { correo: credenciales.correo },
      data: { activo: false },
    });

    const respuesta = await request(app).post("/auth/login").send(credenciales);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("responde 401 a un usuario sin contraseña local", async () => {
    // Caso real: una cuenta creada solo con un proveedor externo.
    await prisma.usuario.create({
      data: {
        correo: "solo.google@ejemplo.cl",
        nombre: "Cuenta Externa",
        hashContrasena: null,
      },
    });

    const respuesta = await request(app)
      .post("/auth/login")
      .send({ correo: "solo.google@ejemplo.cl", contrasena: "contrasena-segura-123" });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("no crea sesión cuando las credenciales fallan", async () => {
    await request(app).post("/auth/registro").send(registroValido);

    await request(app)
      .post("/auth/login")
      .send({ ...credenciales, contrasena: "contrasena-equivocada" });

    expect(await prisma.sesion.count()).toBe(0);
  });
});

describe("GET /auth/yo", () => {
  it("devuelve el usuario con un token válido", async () => {
    const login = await registrarYAutenticar();

    const respuesta = await request(app)
      .get("/auth/yo")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuario.correo).toBe(credenciales.correo);
    expect(respuesta.body.usuario).not.toHaveProperty("hashContrasena");
  });

  it("responde 401 sin cabecera Authorization", async () => {
    const respuesta = await request(app).get("/auth/yo");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("responde 401 con un token alterado", async () => {
    const login = await registrarYAutenticar();
    const alterado = `${String(login.body.accessToken).slice(0, -3)}abc`;

    const respuesta = await request(app).get("/auth/yo").set("Authorization", `Bearer ${alterado}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("responde 401 con un token vencido", async () => {
    const login = await registrarYAutenticar();
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: credenciales.correo },
      select: { id: true, rol: true },
    });

    const vencido = jwt.sign({ sub: usuario.id, rol: usuario.rol }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: -10,
    });

    expect(login.status).toBe(200);

    const respuesta = await request(app).get("/auth/yo").set("Authorization", `Bearer ${vencido}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("responde 401 a un token firmado con alg none", async () => {
    await registrarYAutenticar();
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: credenciales.correo },
      select: { id: true, rol: true },
    });

    // Se arma a mano el ataque clásico: cabecera alg "none" y sin firma.
    const cabecera = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const cuerpo = Buffer.from(
      JSON.stringify({ sub: usuario.id, rol: usuario.rol }),
    ).toString("base64url");
    const tokenSinFirma = `${cabecera}.${cuerpo}.`;

    const respuesta = await request(app)
      .get("/auth/yo")
      .set("Authorization", `Bearer ${tokenSinFirma}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("TOKEN_INVALIDO");
  });

  it("responde 401 si el usuario fue desactivado después de emitir el token", async () => {
    const login = await registrarYAutenticar();
    await prisma.usuario.update({
      where: { correo: credenciales.correo },
      data: { activo: false },
    });

    const respuesta = await request(app)
      .get("/auth/yo")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(respuesta.status).toBe(401);
  });
});

describe("POST /auth/refrescar", () => {
  it("entrega una cookie distinta y deja revocada la anterior", async () => {
    const login = await registrarYAutenticar();
    const cookieInicial = cookieParaEnviar(login);

    const respuesta = await request(app).post("/auth/refrescar").set("Cookie", cookieInicial);

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.accessToken).toBe("string");

    const cookieNueva = cookieParaEnviar(respuesta);
    expect(cookieNueva).not.toBe(cookieInicial);

    const sesiones = await prisma.sesion.findMany({
      orderBy: { creadaEn: "asc" },
      select: { revocadaEn: true, reemplazadaPor: true, id: true },
    });

    expect(sesiones).toHaveLength(2);
    expect(sesiones[0]?.revocadaEn).not.toBeNull();
    expect(sesiones[0]?.reemplazadaPor).toBe(sesiones[1]?.id);
    expect(sesiones[1]?.revocadaEn).toBeNull();
  });

  it("responde 401 sin cookie", async () => {
    const respuesta = await request(app).post("/auth/refrescar");

    expect(respuesta.status).toBe(401);
  });

  it("detecta la reutilización de un token ya rotado y revoca todas las sesiones", async () => {
    const login = await registrarYAutenticar();
    const cookieInicial = cookieParaEnviar(login);

    await request(app).post("/auth/refrescar").set("Cookie", cookieInicial);

    // El atacante reutiliza la cookie vieja que alcanzó a copiar.
    const reutilizacion = await request(app)
      .post("/auth/refrescar")
      .set("Cookie", cookieInicial);

    expect(reutilizacion.status).toBe(401);

    const sesionesActivas = await prisma.sesion.count({ where: { revocadaEn: null } });
    expect(sesionesActivas).toBe(0);
  });
});

describe("POST /auth/logout", () => {
  it("revoca la sesión, limpia la cookie y deja inservible el refresco", async () => {
    const login = await registrarYAutenticar();
    const cookie = cookieParaEnviar(login);

    const respuesta = await request(app).post("/auth/logout").set("Cookie", cookie);

    expect(respuesta.status).toBe(204);
    expect(cookieRefrescoCompleta(respuesta)).toContain("lc_refresh=;");

    expect(await prisma.sesion.count({ where: { revocadaEn: null } })).toBe(0);

    const refresco = await request(app).post("/auth/refrescar").set("Cookie", cookie);
    expect(refresco.status).toBe(401);
  });

  it("es idempotente: responde 204 aunque no haya cookie", async () => {
    const respuesta = await request(app).post("/auth/logout");

    expect(respuesta.status).toBe(204);
  });
});
