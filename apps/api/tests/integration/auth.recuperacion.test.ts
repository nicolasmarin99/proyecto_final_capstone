import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { TipoToken } from "../../src/generated/prisma/client.js";
import { hashearToken } from "../../src/shared/tokens.js";
import { bandeja } from "../bandeja.js";

const CONTRASENA = "contrasena-segura-123";
const NUEVA = "contrasena-nueva-456789";

const registro = {
  nombre: "Ana Pérez",
  correo: "ana.perez@ejemplo.cl",
  contrasena: CONTRASENA,
};

function tokenDelCorreo(cuerpo: string): string {
  const encontrado = /token=([A-Za-z0-9_%-]+)/.exec(cuerpo);

  if (!encontrado?.[1]) {
    throw new Error("El correo no trae un enlace con token.");
  }

  return decodeURIComponent(encontrado[1]);
}

function cookieDe(respuesta: request.Response): string {
  const cabecera: unknown = respuesta.headers["set-cookie"];
  const cookies = Array.isArray(cabecera)
    ? cabecera.filter((valor): valor is string => typeof valor === "string")
    : [];
  const refresco = cookies.find((valor) => valor.startsWith("lc_refresh="));

  if (!refresco) {
    throw new Error("La respuesta no trae cookie de refresco.");
  }

  return refresco.split(";")[0] ?? "";
}

async function crearCuenta() {
  await request(app).post("/auth/registro").send(registro);
  bandeja().vaciar();
}

async function entrar(contrasena = CONTRASENA) {
  const respuesta = await request(app)
    .post("/auth/login")
    .send({ correo: registro.correo, contrasena });

  expect(respuesta.status).toBe(200);

  return { token: String(respuesta.body.accessToken), cookie: cookieDe(respuesta) };
}

/** Pide el enlace de recuperación y devuelve su token. */
async function pedirEnlaceDeRecuperacion(): Promise<string> {
  await prisma.tokenCuenta.deleteMany({ where: { tipo: TipoToken.RECUPERACION_CONTRASENA } });
  bandeja().vaciar();

  await request(app).post("/auth/recuperar").send({ correo: registro.correo });

  const correo = bandeja().ultimoPara(registro.correo);

  if (!correo) {
    throw new Error("No se envió el correo de recuperación.");
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

describe("POST /auth/recuperar", () => {
  it("responde exactamente lo mismo exista o no la cuenta", async () => {
    await crearCuenta();

    const existente = await request(app).post("/auth/recuperar").send({ correo: registro.correo });
    const inexistente = await request(app)
      .post("/auth/recuperar")
      .send({ correo: "nadie@ejemplo.cl" });

    expect(existente.status).toBe(inexistente.status);
    expect(existente.body).toEqual(inexistente.body);
  });

  it("envía el enlace solo a la cuenta que existe", async () => {
    await crearCuenta();

    await request(app).post("/auth/recuperar").send({ correo: registro.correo });
    await request(app).post("/auth/recuperar").send({ correo: "nadie@ejemplo.cl" });

    expect(bandeja().paraDireccion(registro.correo)).toHaveLength(1);
    expect(bandeja().paraDireccion("nadie@ejemplo.cl")).toHaveLength(0);
    expect(bandeja().ultimoPara(registro.correo)?.asunto).toContain("Recupera el acceso");
  });

  it("guarda el token hasheado con el tipo de recuperación", async () => {
    await crearCuenta();
    const token = await pedirEnlaceDeRecuperacion();

    const guardado = await prisma.tokenCuenta.findUniqueOrThrow({
      where: { hashToken: hashearToken(token) },
      select: { tipo: true, expiraEn: true },
    });

    expect(guardado.tipo).toBe(TipoToken.RECUPERACION_CONTRASENA);
    // Treinta minutos, no veinticuatro horas: este enlace da acceso a la cuenta.
    const minutos = (guardado.expiraEn.getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(25);
    expect(minutos).toBeLessThanOrEqual(30);
  });

  it("frena las solicitudes seguidas", async () => {
    await crearCuenta();

    await request(app).post("/auth/recuperar").send({ correo: registro.correo });
    await request(app).post("/auth/recuperar").send({ correo: registro.correo });

    expect(bandeja().paraDireccion(registro.correo)).toHaveLength(1);
  });
});

describe("POST /auth/restablecer", () => {
  it("cambia la contraseña y permite entrar con la nueva", async () => {
    await crearCuenta();
    const token = await pedirEnlaceDeRecuperacion();

    const respuesta = await request(app)
      .post("/auth/restablecer")
      .send({ token, contrasena: NUEVA });

    expect(respuesta.status).toBe(200);

    const conNueva = await request(app)
      .post("/auth/login")
      .send({ correo: registro.correo, contrasena: NUEVA });

    const conVieja = await request(app)
      .post("/auth/login")
      .send({ correo: registro.correo, contrasena: CONTRASENA });

    expect(conNueva.status).toBe(200);
    expect(conVieja.status).toBe(401);
  });

  it("revoca TODAS las sesiones: un refresco anterior deja de servir", async () => {
    await crearCuenta();
    const sesionPrevia = await entrar();
    const otraSesion = await entrar();

    const token = await pedirEnlaceDeRecuperacion();
    await request(app).post("/auth/restablecer").send({ token, contrasena: NUEVA });

    const refrescoPrevio = await request(app)
      .post("/auth/refrescar")
      .set("Cookie", sesionPrevia.cookie);

    const refrescoOtra = await request(app)
      .post("/auth/refrescar")
      .set("Cookie", otraSesion.cookie);

    expect(refrescoPrevio.status).toBe(401);
    expect(refrescoOtra.status).toBe(401);
    expect(await prisma.sesion.count({ where: { revocadaEn: null } })).toBe(0);
  });

  it("avisa por correo del cambio", async () => {
    await crearCuenta();
    const token = await pedirEnlaceDeRecuperacion();
    bandeja().vaciar();

    await request(app).post("/auth/restablecer").send({ token, contrasena: NUEVA });

    expect(bandeja().ultimoPara(registro.correo)?.asunto).toContain("Tu contraseña de LocalCL cambió");
  });

  it("rechaza el token ya usado, el vencido y el inventado con el mismo error", async () => {
    await crearCuenta();

    const usado = await pedirEnlaceDeRecuperacion();
    await request(app).post("/auth/restablecer").send({ token: usado, contrasena: NUEVA });
    const reintento = await request(app)
      .post("/auth/restablecer")
      .send({ token: usado, contrasena: NUEVA });

    const vencidoToken = await pedirEnlaceDeRecuperacion();
    await prisma.tokenCuenta.update({
      where: { hashToken: hashearToken(vencidoToken) },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });
    const vencido = await request(app)
      .post("/auth/restablecer")
      .send({ token: vencidoToken, contrasena: NUEVA });

    const inventado = await request(app)
      .post("/auth/restablecer")
      .send({ token: "nunca-existio", contrasena: NUEVA });

    expect(reintento.status).toBe(400);
    expect(reintento.body.error.codigo).toBe("ENLACE_INVALIDO");
    expect(vencido.body).toEqual(reintento.body);
    expect(inventado.body).toEqual(reintento.body);
  });

  it("no acepta un token de verificación de correo", async () => {
    await request(app).post("/auth/registro").send(registro);

    const correoVerificacion = bandeja().ultimoPara(registro.correo);
    const tokenVerificacion = tokenDelCorreo(correoVerificacion?.cuerpo ?? "");

    const respuesta = await request(app)
      .post("/auth/restablecer")
      .send({ token: tokenVerificacion, contrasena: NUEVA });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("ENLACE_INVALIDO");
  });

  it("aplica las reglas de contraseña a la nueva", async () => {
    await crearCuenta();
    const token = await pedirEnlaceDeRecuperacion();

    const respuesta = await request(app)
      .post("/auth/restablecer")
      .send({ token, contrasena: "123456789" });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("DATOS_INVALIDOS");
  });
});

describe("POST /auth/cambiar-contrasena", () => {
  it("falla con la contraseña actual incorrecta y no cambia nada", async () => {
    await crearCuenta();
    const sesion = await entrar();

    const respuesta = await request(app)
      .post("/auth/cambiar-contrasena")
      .set("Authorization", `Bearer ${sesion.token}`)
      .set("Cookie", sesion.cookie)
      .send({ contrasenaActual: "equivocada", contrasenaNueva: NUEVA });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe("CONTRASENA_ACTUAL_INCORRECTA");

    const sigueLaVieja = await request(app)
      .post("/auth/login")
      .send({ correo: registro.correo, contrasena: CONTRASENA });

    expect(sigueLaVieja.status).toBe(200);
  });

  it("con la actual correcta cierra las demás sesiones y mantiene la propia", async () => {
    await crearCuenta();
    const otraSesion = await entrar();
    const sesionActual = await entrar();

    const respuesta = await request(app)
      .post("/auth/cambiar-contrasena")
      .set("Authorization", `Bearer ${sesionActual.token}`)
      .set("Cookie", sesionActual.cookie)
      .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

    expect(respuesta.status).toBe(200);

    const refrescoPropio = await request(app)
      .post("/auth/refrescar")
      .set("Cookie", sesionActual.cookie);

    const refrescoAjeno = await request(app)
      .post("/auth/refrescar")
      .set("Cookie", otraSesion.cookie);

    // La sesión desde la que se pidió el cambio sigue viva; la otra, no.
    expect(refrescoPropio.status).toBe(200);
    expect(refrescoAjeno.status).toBe(401);
  });

  it("avisa por correo del cambio", async () => {
    await crearCuenta();
    const sesion = await entrar();
    bandeja().vaciar();

    await request(app)
      .post("/auth/cambiar-contrasena")
      .set("Authorization", `Bearer ${sesion.token}`)
      .set("Cookie", sesion.cookie)
      .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

    expect(bandeja().ultimoPara(registro.correo)?.asunto).toContain("Tu contraseña de LocalCL cambió");
  });

  it("responde 401 sin sesión", async () => {
    const respuesta = await request(app)
      .post("/auth/cambiar-contrasena")
      .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

    expect(respuesta.status).toBe(401);
  });
});
