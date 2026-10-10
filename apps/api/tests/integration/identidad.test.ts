import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { AlmacenamientoEnMemoria, obtenerAlmacenamiento } from "../../src/modules/almacenamiento/index.js";
import { jpgConExif, pdfMinimo, pngConTexto } from "../archivos.js";

const CONTRASENA = "contrasena-segura-123";
const RUT = "12345678-5";

/** Las pruebas corren con ALMACENAMIENTO_TRANSPORTE=memoria: nada sale a la red. */
function almacenamiento(): AlmacenamientoEnMemoria {
  const actual = obtenerAlmacenamiento();
  if (!(actual instanceof AlmacenamientoEnMemoria)) {
    throw new Error("Las pruebas deben usar el almacenamiento en memoria.");
  }
  return actual;
}

async function vaciar() {
  // TRUNCATE: las bitácoras (eventos, accesos) rechazan DELETE.
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
  almacenamiento().vaciar();
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; rut?: string } = {}) {
  secuencia += 1;
  const correo = `persona${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      rut: opciones.rut ?? null,
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  return { ...usuario, token: await tokenDe(correo) };
}

async function tokenDe(correo: string) {
  const respuesta = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(respuesta.status).toBe(200);
  return String(respuesta.body.accessToken);
}

/** Prestador verificado, con RUT y con perfil: el caso normal de quien sube su cédula. */
async function crearPrestador(
  opciones: { correoVerificado?: boolean; conPerfil?: boolean; rut?: string } = {},
) {
  const prestador = await crearUsuario("PRESTADOR", {
    rut: opciones.rut ?? RUT,
    correoVerificado: opciones.correoVerificado,
  });
  if (opciones.conPerfil ?? true) {
    await prisma.perfilPrestador.create({ data: { usuarioId: prestador.id, comunaId: 13101 } });
  }
  return prestador;
}

function subir(token: string, contenido: Buffer, nombre = "cedula.jpg", tipo = "image/jpeg") {
  return request(app)
    .post("/prestadores/yo/identidad")
    .set("Authorization", `Bearer ${token}`)
    .attach("documento", contenido, { filename: nombre, contentType: tipo });
}

function estadoPropio(token: string) {
  return request(app).get("/prestadores/yo/identidad").set("Authorization", `Bearer ${token}`);
}

function cola(token: string, consulta = "?estado=PENDIENTE") {
  return request(app).get(`/admin/identidades${consulta}`).set("Authorization", `Bearer ${token}`);
}

function documento(token: string, id: string) {
  return request(app).get(`/admin/identidades/${id}/documento`).set("Authorization", `Bearer ${token}`);
}

function aprobar(token: string, id: string) {
  return request(app).patch(`/admin/identidades/${id}/aprobar`).set("Authorization", `Bearer ${token}`);
}

function rechazar(token: string, id: string, cuerpo: object = { motivo: "La foto está borrosa y no se lee el RUT." }) {
  return request(app).patch(`/admin/identidades/${id}/rechazar`).set("Authorization", `Bearer ${token}`).send(cuerpo);
}

/** La credencial de identidad pendiente que dejó una carga. */
async function credencialPendiente() {
  return prisma.credencial.findFirstOrThrow({ where: { estado: "PENDIENTE", tipo: { codigo: "IDENTIDAD" } } });
}

function detalleDe(cuerpo: { error?: { detalles?: { campo: string; mensaje: string }[] } }, campo: string) {
  return cuerpo.error?.detalles?.find((detalle) => detalle.campo === campo)?.mensaje;
}

describe("POST /prestadores/yo/identidad", () => {
  it("carga válida: la credencial queda PENDIENTE y se registra el evento", async () => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, jpgConExif());

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.identidad.estado).toBe("PENDIENTE");

    const credencial = await credencialPendiente();
    const eventos = await prisma.eventoCredencial.findMany({ where: { credencialId: credencial.id } });
    expect(eventos).toEqual([
      expect.objectContaining({ estadoAnterior: null, estadoNuevo: "PENDIENTE", autorId: prestador.id }),
    ]);
    // El archivo se guarda con el id de la credencial, no con su nombre original.
    expect(almacenamiento().existe(credencial.id)).toBe(true);
  });

  it("guarda el archivo sin EXIF y sin el nombre original", async () => {
    const prestador = await crearPrestador();

    await subir(prestador.token, jpgConExif(), "foto-de-mi-carnet-juan-perez.jpg");

    const credencial = await credencialPendiente();
    const guardado = almacenamiento().contenido(credencial.id);
    expect(guardado?.includes("GPS-SECRETO")).toBe(false);
    expect(JSON.stringify(credencial)).not.toContain("juan-perez");
  });

  it.each([
    ["PNG", pngConTexto(), "cedula.png", "image/png"],
    ["PDF", pdfMinimo(), "cedula.pdf", "application/pdf"],
  ])("acepta un %s", async (_tipo, contenido, nombre, mime) => {
    const prestador = await crearPrestador();

    expect((await subir(prestador.token, contenido, nombre, mime)).status).toBe(201);
  });

  it("archivo cuyo contenido real no es JPG, PNG ni PDF: 400 (aunque diga ser .jpg)", async () => {
    const prestador = await crearPrestador();
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");

    const respuesta = await subir(prestador.token, html, "cedula.jpg", "image/jpeg");

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "documento")).toMatch(/JPG|PNG|PDF/);
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("archivo de más de 5 MB: 400", async () => {
    const prestador = await crearPrestador();
    const grande = Buffer.concat([jpgConExif(), Buffer.alloc(5 * 1024 * 1024)]);

    const respuesta = await subir(prestador.token, grande);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "documento")).toMatch(/5 MB/);
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("sin archivo: 400", async () => {
    const prestador = await crearPrestador();

    const respuesta = await request(app)
      .post("/prestadores/yo/identidad")
      .set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, "documento")).toBeDefined();
  });

  it("segunda carga con una pendiente: 409", async () => {
    const prestador = await crearPrestador();
    await subir(prestador.token, jpgConExif());

    const respuesta = await subir(prestador.token, jpgConExif());

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("VERIFICACION_PENDIENTE");
    expect(almacenamiento().cantidad).toBe(1);
  });

  it("cuarta carga en 24 horas: 429", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");

    // Tres cargas, cada una rechazada para que no quede ninguna pendiente.
    for (let i = 0; i < 3; i += 1) {
      expect((await subir(prestador.token, jpgConExif())).status).toBe(201);
      expect((await rechazar(admin.token, (await credencialPendiente()).id)).status).toBe(200);
    }

    const respuesta = await subir(prestador.token, jpgConExif());

    expect(respuesta.status).toBe(429);
    expect(respuesta.body.error.codigo).toBe("DEMASIADAS_CARGAS");
  });

  it("un cliente no puede cargar: 403", async () => {
    const cliente = await crearUsuario("CLIENTE");

    expect((await subir(cliente.token, jpgConExif())).status).toBe(403);
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("un prestador sin correo verificado: 403", async () => {
    const prestador = await crearPrestador({ correoVerificado: false });

    const respuesta = await subir(prestador.token, jpgConExif());

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CORREO_NO_VERIFICADO");
  });

  it("un prestador sin perfil: 409, primero tiene que completarlo", async () => {
    const prestador = await crearPrestador({ conPerfil: false });

    const respuesta = await subir(prestador.token, jpgConExif());

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PERFIL_REQUERIDO");
  });
});

describe("GET /prestadores/yo/identidad", () => {
  it("sin cargas: identidad null", async () => {
    const prestador = await crearPrestador();

    const respuesta = await estadoPropio(prestador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.identidad).toBeNull();
  });

  it("el estado propio nunca incluye una URL del documento", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    // Aunque el administrador ya haya pedido una URL firmada.
    await documento(admin.token, (await credencialPendiente()).id);

    const respuesta = await estadoPropio(prestador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.identidad.estado).toBe("PENDIENTE");
    expect(respuesta.text).not.toMatch(/https?:|data:|url/i);
  });
});

describe("Administración de identidades", () => {
  it("un prestador no puede ver la cola de administración: 403", async () => {
    const prestador = await crearPrestador();

    expect((await cola(prestador.token)).status).toBe(403);
  });

  it("la cola lista las pendientes, paginadas, con lo mínimo para revisar", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    // El RUT es único por cuenta: cada prestador lleva el suyo.
    const ruts = ["11111111-1", "22222222-2", "33333333-3"];
    for (const rut of ruts) {
      const prestador = await crearPrestador({ rut });
      await subir(prestador.token, jpgConExif());
    }

    const primera = await cola(admin.token, "?estado=PENDIENTE&pagina=1&porPagina=2");
    const segunda = await cola(admin.token, "?estado=PENDIENTE&pagina=2&porPagina=2");

    expect(primera.status).toBe(200);
    expect(primera.body.total).toBe(3);
    expect(primera.body.identidades).toHaveLength(2);
    expect(segunda.body.identidades).toHaveLength(1);
    // Las más antiguas primero.
    expect(primera.body.identidades[0].prestador).toMatchObject({ rut: ruts[0], comuna: "Santiago" });
    // Ni correo ni URL: no hacen falta para decidir.
    expect(primera.text).not.toMatch(/@ejemplo\.cl|https?:|data:/);
  });

  it("estado inválido en la consulta: 400", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    expect((await cola(admin.token, "?estado=CUALQUIERA")).status).toBe(400);
  });

  it("pedir el documento entrega una URL y deja registro de quién y cuándo", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    const credencial = await credencialPendiente();

    const respuesta = await documento(admin.token, credencial.id);

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.url).toBe("string");
    expect(respuesta.headers["cache-control"]).toMatch(/no-store/);
    const accesos = await prisma.accesoDocumento.findMany();
    expect(accesos).toEqual([expect.objectContaining({ credencialId: credencial.id, administradorId: admin.id })]);
    // El registro nunca guarda la URL.
    expect(JSON.stringify(accesos)).not.toContain(String(respuesta.body.url));
  });

  it("aprobar elimina el archivo del almacenamiento y deja rut_verificado en true", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    const credencial = await credencialPendiente();

    const respuesta = await aprobar(admin.token, credencial.id);

    expect(respuesta.status).toBe(200);
    expect(almacenamiento().existe(credencial.id)).toBe(false);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: prestador.id } })).rutVerificado).toBe(true);
    expect(await prisma.credencial.findUniqueOrThrow({ where: { id: credencial.id } })).toMatchObject({
      estado: "VERIFICADA",
      metodo: "MANUAL",
      verificadoPorId: admin.id,
    });
    expect(
      await prisma.eventoCredencial.findFirst({ where: { credencialId: credencial.id, estadoNuevo: "VERIFICADA" } }),
    ).toMatchObject({ estadoAnterior: "PENDIENTE", autorId: admin.id });
  });

  it("después de aprobar, el documento ya no se puede pedir ni volver a revisar", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    const credencial = await credencialPendiente();
    await aprobar(admin.token, credencial.id);

    expect((await documento(admin.token, credencial.id)).status).toBe(409);
    expect((await rechazar(admin.token, credencial.id)).status).toBe(409);
    // Y el prestador ya verificado no puede volver a subir.
    expect((await subir(prestador.token, jpgConExif())).status).toBe(409);
  });

  it("rechazar sin motivo: 400", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    const credencial = await credencialPendiente();

    const sinCampo = await rechazar(admin.token, credencial.id, {});
    const enBlanco = await rechazar(admin.token, credencial.id, { motivo: "   " });

    expect(sinCampo.status).toBe(400);
    expect(detalleDe(sinCampo.body, "motivo")).toBeDefined();
    expect(enBlanco.status).toBe(400);
    // Sigue pendiente y con su archivo: un rechazo inválido no cambia nada.
    expect(almacenamiento().existe(credencial.id)).toBe(true);
  });

  it("rechazar elimina el archivo y conserva el motivo, que el prestador puede ver", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, jpgConExif());
    const credencial = await credencialPendiente();
    const motivo = "La foto está borrosa y no se lee el RUT.";

    const respuesta = await rechazar(admin.token, credencial.id, { motivo });

    expect(respuesta.status).toBe(200);
    expect(almacenamiento().existe(credencial.id)).toBe(false);
    expect(await prisma.credencial.findUniqueOrThrow({ where: { id: credencial.id } })).toMatchObject({
      estado: "RECHAZADA",
      motivoRechazo: motivo,
    });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: prestador.id } })).rutVerificado).toBe(false);
    expect((await estadoPropio(prestador.token)).body.identidad).toMatchObject({ estado: "RECHAZADA", motivoRechazo: motivo });
  });

  it("una identidad inexistente: 404", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    expect((await aprobar(admin.token, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
