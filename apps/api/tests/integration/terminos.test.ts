import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { ACEPTACION_REGISTRO, TERMINOS_ACEPTADOS, VERSION_TERMINOS_VIGENTE } from "../terminos.js";

const CONTRASENA = "contrasena-segura-123";
const VERSION_DE_PRUEBA = "prueba-versión-nueva";

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
  // Una versión de prueba que haya quedado de una ejecución interrumpida.
  await prisma.versionTerminos.deleteMany({ where: { version: VERSION_DE_PRUEBA } });
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});
beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

/** Una cuenta creada directo en la base; `aceptada` decide si nace con los términos aceptados. */
async function cuenta(aceptada: boolean, rol: "CLIENTE" | "PRESTADOR" = "CLIENTE") {
  secuencia += 1;
  const correo = `terminos${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      ...(aceptada ? TERMINOS_ACEPTADOS : {}),
      correo,
      nombre: `Persona${secuencia} Apellido`,
      rol,
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken), login };
}

const conSesion = (token: string, ruta: string) => request(app).get(ruta).set("Authorization", `Bearer ${token}`);
const aceptar = (token: string, cuerpo: object) => request(app).post("/terminos/aceptar").set("Authorization", `Bearer ${token}`).send(cuerpo);

function registroCliente(cambios: object = {}) {
  secuencia += 1;
  return {
    nombre: "Ana Pérez",
    correo: `registro${secuencia}@ejemplo.cl`,
    contrasena: CONTRASENA,
    ...ACEPTACION_REGISTRO,
    ...cambios,
  };
}

const RUTS_VALIDOS = ["12.345.678-5", "11.111.111-1", "22.222.222-2", "33.333.333-3"];
let rut = 0;
function registroPrestador(cambios: object = {}) {
  rut += 1;
  return { ...registroCliente(), nombre: "Pedro Soto", rut: RUTS_VALIDOS[rut % RUTS_VALIDOS.length], ...cambios };
}

function campos(cuerpo: { error?: { detalles?: { campo: string }[] } }) {
  return (cuerpo.error?.detalles ?? []).map((detalle) => detalle.campo);
}

describe("GET /terminos/vigente", () => {
  it("es pública y entrega la versión vigente con los términos y la política de privacidad", async () => {
    const respuesta = await request(app).get("/terminos/vigente");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.terminos.version).toBe(VERSION_TERMINOS_VIGENTE);
    const { contenido } = respuesta.body.terminos as { contenido: string };
    expect(contenido).toContain("Parte I. Términos y condiciones de uso");
    expect(contenido).toContain("Parte II. Política de privacidad");
    for (const ley of ["Ley N° 19.628", "Ley N° 21.719", "Ley N° 19.496"]) expect(contenido).toContain(ley);
    expect(contenido).toContain("mayor de 18 años");
  });
});

describe("Registro: aceptar los términos es obligatorio, para clientes y prestadores", () => {
  for (const [tipo, ruta, datos] of [
    ["cliente", "/auth/registro", registroCliente],
    ["prestador", "/auth/registro-prestador", registroPrestador],
  ] as const) {
    it(`${tipo}: con la aceptación y la mayoría de edad, crea la cuenta y guarda qué versión aceptó`, async () => {
      const cuerpo = datos();
      const antes = Date.now();

      const respuesta = await request(app).post(ruta).send(cuerpo);

      expect(respuesta.status).toBe(202);
      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { correo: cuerpo.correo },
        select: { aceptacionesTerminos: { select: { aceptadaEn: true, version: { select: { version: true } } } } },
      });
      expect(usuario.aceptacionesTerminos).toHaveLength(1);
      expect(usuario.aceptacionesTerminos[0]?.version.version).toBe(VERSION_TERMINOS_VIGENTE);
      expect(usuario.aceptacionesTerminos[0]!.aceptadaEn.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    });

    it(`${tipo}: sin aceptar los términos, 400 en «aceptaTerminos» y no se crea la cuenta`, async () => {
      for (const aceptaTerminos of [undefined, false, "true", 1]) {
        const cuerpo = datos({ aceptaTerminos });
        const respuesta = await request(app).post(ruta).send(cuerpo);
        expect(respuesta.status, String(aceptaTerminos)).toBe(400);
        expect(campos(respuesta.body)).toContain("aceptaTerminos");
        expect(await prisma.usuario.count({ where: { correo: cuerpo.correo } })).toBe(0);
      }
    });

    it(`${tipo}: sin declarar ser mayor de 18 años, 400 en «mayorDeEdad»`, async () => {
      const cuerpo = datos({ mayorDeEdad: false });

      const respuesta = await request(app).post(ruta).send(cuerpo);

      expect(respuesta.status).toBe(400);
      expect(campos(respuesta.body)).toContain("mayorDeEdad");
      expect(await prisma.usuario.count({ where: { correo: cuerpo.correo } })).toBe(0);
    });

    it(`${tipo}: aceptando una versión que ya no rige, 409 y no se crea la cuenta`, async () => {
      const cuerpo = datos({ versionTerminos: "2026-10" });

      const respuesta = await request(app).post(ruta).send(cuerpo);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe("TERMINOS_DESACTUALIZADOS");
      expect(await prisma.usuario.count({ where: { correo: cuerpo.correo } })).toBe(0);
    });
  }
});

describe("Cuentas que no aceptaron la versión vigente", () => {
  it("pueden iniciar sesión y saber que les faltan, pero ninguna otra ruta con sesión responde hasta aceptarlos", async () => {
    const sinAceptar = await cuenta(false);

    expect(sinAceptar.login.body.usuario.terminosPendientes).toBe(true);
    const yo = await conSesion(sinAceptar.token, "/auth/yo");
    expect(yo.status).toBe(200);
    expect(yo.body.usuario.terminosPendientes).toBe(true);

    // Rutas con rol (autorizar) y rutas solo con sesión: todas exigen los términos.
    for (const ruta of ["/contrataciones", "/cuenta/foto"]) {
      const respuesta = await conSesion(sinAceptar.token, ruta);
      expect(respuesta.status, ruta).toBe(403);
      expect(respuesta.body.error.codigo, ruta).toBe("TERMINOS_PENDIENTES");
    }
    const cambio = await request(app)
      .post("/auth/cambiar-contrasena")
      .set("Authorization", `Bearer ${sinAceptar.token}`)
      .send({ contrasenaActual: CONTRASENA, contrasenaNueva: "otra-contrasena-segura-456" });
    expect(cambio.status).toBe(403);
  });

  it("al aceptar la versión vigente quedan habilitadas, y la aceptación queda guardada", async () => {
    const sinAceptar = await cuenta(false);

    const respuesta = await aceptar(sinAceptar.token, { aceptaTerminos: true, versionTerminos: VERSION_TERMINOS_VIGENTE });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ version: VERSION_TERMINOS_VIGENTE, terminosPendientes: false });
    expect((await conSesion(sinAceptar.token, "/contrataciones")).status).toBe(200);
    expect((await conSesion(sinAceptar.token, "/auth/yo")).body.usuario.terminosPendientes).toBe(false);
    expect(await prisma.aceptacionTerminos.count({ where: { usuarioId: sinAceptar.id } })).toBe(1);
  });

  it("aceptar dos veces no duplica ni cambia la fecha de la primera", async () => {
    const sinAceptar = await cuenta(false);
    await aceptar(sinAceptar.token, { aceptaTerminos: true, versionTerminos: VERSION_TERMINOS_VIGENTE });
    const primera = await prisma.aceptacionTerminos.findFirstOrThrow({ where: { usuarioId: sinAceptar.id } });

    const segunda = await aceptar(sinAceptar.token, { aceptaTerminos: true, versionTerminos: VERSION_TERMINOS_VIGENTE });

    expect(segunda.status).toBe(200);
    const filas = await prisma.aceptacionTerminos.findMany({ where: { usuarioId: sinAceptar.id } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.aceptadaEn).toEqual(primera.aceptadaEn);
  });

  it("aceptar exige la casilla, la versión vigente y una sesión", async () => {
    const sinAceptar = await cuenta(false);

    expect((await aceptar(sinAceptar.token, { versionTerminos: VERSION_TERMINOS_VIGENTE })).status).toBe(400);
    const vieja = await aceptar(sinAceptar.token, { aceptaTerminos: true, versionTerminos: "2026-10" });
    expect(vieja.status).toBe(409);
    expect(vieja.body.error.codigo).toBe("TERMINOS_DESACTUALIZADOS");
    expect((await request(app).post("/terminos/aceptar").send({ aceptaTerminos: true, versionTerminos: VERSION_TERMINOS_VIGENTE })).status).toBe(401);
    expect(await prisma.aceptacionTerminos.count({ where: { usuarioId: sinAceptar.id } })).toBe(0);
  });

  it("una cuenta que aceptó no ve nada distinto", async () => {
    const aceptada = await cuenta(true, "PRESTADOR");

    expect(aceptada.login.body.usuario.terminosPendientes).toBe(false);
    expect((await conSesion(aceptada.token, "/prestadores/yo")).status).not.toBe(403);
  });
});

describe("Una versión nueva", () => {
  async function publicar(vigenteDesde: Date) {
    return prisma.versionTerminos.create({ data: { version: VERSION_DE_PRUEBA, vigenteDesde, contenido: "Versión de prueba." } });
  }

  it("desde su fecha de vigencia, quien aceptó la anterior debe aceptarla para seguir", async () => {
    const aceptada = await cuenta(true);
    await publicar(new Date(Date.now() - 1000));

    expect((await conSesion(aceptada.token, "/contrataciones")).body.error.codigo).toBe("TERMINOS_PENDIENTES");
    expect((await request(app).get("/terminos/vigente")).body.terminos.version).toBe(VERSION_DE_PRUEBA);
    // La anterior ya no sirve para aceptar.
    expect((await aceptar(aceptada.token, { aceptaTerminos: true, versionTerminos: VERSION_TERMINOS_VIGENTE })).status).toBe(409);

    expect((await aceptar(aceptada.token, { aceptaTerminos: true, versionTerminos: VERSION_DE_PRUEBA })).status).toBe(200);
    expect((await conSesion(aceptada.token, "/contrataciones")).status).toBe(200);
  });

  it("antes de su fecha de vigencia, no rige: nadie tiene que aceptarla todavía", async () => {
    const aceptada = await cuenta(true);
    await publicar(new Date(Date.now() + 24 * 60 * 60 * 1000));

    expect((await conSesion(aceptada.token, "/contrataciones")).status).toBe(200);
    expect((await request(app).get("/terminos/vigente")).body.terminos.version).toBe(VERSION_TERMINOS_VIGENTE);
  });
});

describe("Una versión publicada no se modifica", () => {
  it("volver a cargar los maestros no cambia el texto que alguien ya aceptó", async () => {
    const antes = await prisma.versionTerminos.findUniqueOrThrow({ where: { version: VERSION_TERMINOS_VIGENTE } });
    await prisma.versionTerminos.update({ where: { id: antes.id }, data: { contenido: "Texto aceptado en una base real." } });

    await cargarMaestros(prisma);

    expect((await prisma.versionTerminos.findUniqueOrThrow({ where: { id: antes.id } })).contenido).toBe("Texto aceptado en una base real.");
    await prisma.versionTerminos.update({ where: { id: antes.id }, data: { contenido: antes.contenido } });
  });
});

describe("Solo dos rutas con sesión pueden saltarse los términos", () => {
  it("autenticarSinExigirTerminos se usa únicamente en /auth/yo y /terminos/aceptar", async () => {
    const raiz = fileURLToPath(new URL("../../src", import.meta.url));
    const usos: string[] = [];
    async function recorrer(carpeta: string) {
      for (const entrada of await readdir(carpeta, { withFileTypes: true })) {
        const ruta = join(carpeta, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name !== "generated") await recorrer(ruta);
        } else if (entrada.name.endsWith(".routes.ts")) {
          const codigo = await readFile(ruta, "utf8");
          for (const linea of codigo.split("\n")) {
            if (/\.(get|post|put|patch|delete)\(/.test(linea) && linea.includes("autenticarSinExigirTerminos")) {
              usos.push(`${relative(raiz, ruta).replaceAll("\\", "/")}: ${linea.trim()}`);
            }
          }
        }
      }
    }
    await recorrer(raiz);

    expect(usos.sort()).toEqual([
      'modules/auth/auth.routes.ts: rutasAuth.get("/yo", autenticarSinExigirTerminos, yo);',
      'modules/terminos/terminos.routes.ts: rutasTerminos.post("/aceptar", autenticarSinExigirTerminos, aceptarVigente);',
    ]);
  });
});
