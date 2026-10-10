import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const CONTRASENA = "contrasena-segura-123";
const SANTIAGO = 13101;
const CHILLAN = 16101;

const PERFIL_VALIDO = {
  descripcion: "Gasfíter con 10 años de experiencia en calefont y filtraciones.",
  telefono: "9 1234 5678",
  comunaId: SANTIAGO,
  radioAtencionKm: 15,
};

/** TRUNCATE y no deleteMany: las tablas nuevas tienen RESTRICT hacia usuarios. */
async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, correoVerificado = true) {
  secuencia += 1;
  const correo = `persona${secuencia}@ejemplo.cl`;
  await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      correoVerificado,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  return correo;
}

/** Token obtenido por el flujo real de login, no firmado a mano. */
async function tokenDe(correo: string) {
  const respuesta = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(respuesta.status).toBe(200);
  return String(respuesta.body.accessToken);
}

async function tokenDePrestador(correoVerificado = true) {
  return tokenDe(await crearUsuario("PRESTADOR", correoVerificado));
}

function guardar(token: string, cuerpo: object) {
  return request(app).put("/prestadores/yo").set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function leer(token: string) {
  return request(app).get("/prestadores/yo").set("Authorization", `Bearer ${token}`);
}

/** Mensaje que la API asoció a un campo en la respuesta 400. */
function detalleDe(cuerpo: { error?: { detalles?: { campo: string; mensaje: string }[] } }, campo: string) {
  return cuerpo.error?.detalles?.find((detalle) => detalle.campo === campo)?.mensaje;
}

describe("PUT /prestadores/yo", () => {
  it("crea el perfil de un prestador con correo verificado: 201 con los datos", async () => {
    const token = await tokenDePrestador();

    const respuesta = await guardar(token, PERFIL_VALIDO);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.perfil).toMatchObject({
      descripcion: PERFIL_VALIDO.descripcion,
      // Se guarda normalizado, no como lo escribió la persona.
      telefono: "+56912345678",
      radioAtencionKm: 15,
      comuna: { id: SANTIAGO, nombre: "Santiago", region: { id: 13 } },
    });
  });

  it("actualizar el perfil existente no crea uno nuevo: 200 y el mismo id", async () => {
    const token = await tokenDePrestador();
    const creado = await guardar(token, PERFIL_VALIDO);

    const actualizado = await guardar(token, { ...PERFIL_VALIDO, comunaId: CHILLAN, radioAtencionKm: 40 });

    expect(actualizado.status).toBe(200);
    expect(actualizado.body.perfil.id).toBe(creado.body.perfil.id);
    expect(actualizado.body.perfil.comuna).toMatchObject({ id: CHILLAN, region: { id: 16 } });
    expect(await prisma.perfilPrestador.count()).toBe(1);
  });

  it("editar el perfil no borra una ubicación ya calculada", async () => {
    // La ubicación todavía no se pide, pero cuando exista la geocodificación
    // no puede perderse cada vez que alguien corrige su descripción.
    const token = await tokenDePrestador();
    const creado = await guardar(token, PERFIL_VALIDO);
    await prisma.$executeRaw`
      UPDATE perfiles_prestador
      SET ubicacion = ST_SetSRID(ST_MakePoint(-70.6505, -33.4378), 4326)::geography
      WHERE id = ${String(creado.body.perfil.id)}`;

    await guardar(token, { ...PERFIL_VALIDO, descripcion: "Descripción corregida, con más detalle del servicio." });

    const [fila] = await prisma.$queryRaw<{ con_ubicacion: boolean }[]>`
      SELECT ubicacion IS NOT NULL AS con_ubicacion FROM perfiles_prestador`;
    expect(fila?.con_ubicacion).toBe(true);
  });

  it("un cliente no puede crear perfil de prestador: 403", async () => {
    const token = await tokenDe(await crearUsuario("CLIENTE"));

    const respuesta = await guardar(token, PERFIL_VALIDO);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_PERMISOS");
    expect(await prisma.perfilPrestador.count()).toBe(0);
  });

  it("un prestador sin correo verificado: 403", async () => {
    const token = await tokenDePrestador(false);

    const respuesta = await guardar(token, PERFIL_VALIDO);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CORREO_NO_VERIFICADO");
    expect(await prisma.perfilPrestador.count()).toBe(0);
  });

  it("sin sesión: 401", async () => {
    const respuesta = await request(app).put("/prestadores/yo").send(PERFIL_VALIDO);

    expect(respuesta.status).toBe(401);
  });

  it.each(["2 2123 4567", "1234 5678", "+54 9 11 1234 5678"])(
    "teléfono inválido (%s): 400 con detalle en el campo",
    async (telefono) => {
      const token = await tokenDePrestador();

      const respuesta = await guardar(token, { ...PERFIL_VALIDO, telefono });

      expect(respuesta.status).toBe(400);
      expect(detalleDe(respuesta.body, "telefono")).toMatch(/celular chileno/i);
    },
  );

  it("comuna inexistente: 400 con detalle en el campo", async () => {
    const token = await tokenDePrestador();

    const respuesta = await guardar(token, { ...PERFIL_VALIDO, comunaId: 99999 });

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "comunaId")).toMatch(/comuna/i);
  });

  it("descripción de 19 caracteres: 400", async () => {
    const token = await tokenDePrestador();
    const descripcion = "a".repeat(19);

    const respuesta = await guardar(token, { ...PERFIL_VALIDO, descripcion });

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "descripcion")).toMatch(/20/);
  });

  it("descripción de 20 caracteres: se acepta (límite exacto)", async () => {
    const token = await tokenDePrestador();

    const respuesta = await guardar(token, { ...PERFIL_VALIDO, descripcion: "a".repeat(20) });

    expect(respuesta.status).toBe(201);
  });

  it.each([0, 201, 2.5])("radio de atención %s: 400", async (radioAtencionKm) => {
    const token = await tokenDePrestador();

    const respuesta = await guardar(token, { ...PERFIL_VALIDO, radioAtencionKm });

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "radioAtencionKm")).toBeDefined();
  });

  it("ignora campos que no le corresponden (ubicación, usuario)", async () => {
    const token = await tokenDePrestador();
    const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: "PRESTADOR" } });

    const respuesta = await guardar(token, { ...PERFIL_VALIDO, usuarioId: "otro-id", ubicacion: "POINT(0 0)" });

    expect(respuesta.status).toBe(201);
    const perfil = await prisma.perfilPrestador.findFirstOrThrow();
    // El perfil es del dueño del token, no del usuarioId que vino en el cuerpo.
    expect(perfil.usuarioId).toBe(dueno.id);
  });
});

describe("GET /prestadores/yo", () => {
  it("404 si todavía no creó su perfil", async () => {
    const token = await tokenDePrestador();

    const respuesta = await leer(token);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe("PERFIL_NO_ENCONTRADO");
  });

  it("devuelve el perfil después de crearlo", async () => {
    const token = await tokenDePrestador();
    await guardar(token, PERFIL_VALIDO);

    const respuesta = await leer(token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.perfil).toMatchObject({ telefono: "+56912345678", comuna: { id: SANTIAGO } });
  });

  it("un cliente no tiene perfil de prestador que leer: 403", async () => {
    const token = await tokenDe(await crearUsuario("CLIENTE"));

    expect((await leer(token)).status).toBe(403);
  });
});

describe("GET /comunas", () => {
  it("es pública y trae las 346 comunas con su región", async () => {
    const respuesta = await request(app).get("/comunas");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.comunas).toHaveLength(346);
    expect(respuesta.body.comunas).toContainEqual({
      id: CHILLAN,
      nombre: "Chillán",
      region: { id: 16, nombre: "Ñuble", orden: 10 },
    });
  });

  it("viene ordenada por nombre según el español (Ñ después de N, tildes ignoradas)", async () => {
    const { body } = await request(app).get("/comunas");
    const nombres: string[] = body.comunas.map((comuna: { nombre: string }) => comuna.nombre);

    expect(nombres).toEqual([...nombres].sort(new Intl.Collator("es").compare));
    // "Ñuñoa" va después de "Nueva Imperial" y no al final, como pasaría
    // ordenando por código de carácter.
    expect(nombres.indexOf("Ñuñoa")).toBeGreaterThan(nombres.indexOf("Nueva Imperial"));
    expect(nombres.indexOf("Ñuñoa")).toBeLessThan(nombres.indexOf("Olivar"));
  });
});
