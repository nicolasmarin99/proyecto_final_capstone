import { Algorithm, hash } from "@node-rs/argon2";

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { AlmacenamientoEnMemoria, obtenerAlmacenamiento, obtenerAlmacenamientoCertificaciones } from "../../src/modules/almacenamiento/index.js";
import { quitarMetadatos } from "../../src/modules/identidad/identidad.documento.js";
import { LectorDeterminista, obtenerLectorDocumentos } from "../../src/modules/lectura-documentos/index.js";
import { esperarLecturasEnCurso, leerPendientes } from "../../src/modules/lectura-documentos/lectura.service.js";
import { jpgConExif, pdfMinimo, pngConTexto } from "../archivos.js";

// vi.hoisted corre ANTES de cargar cualquier módulo de los de arriba: en este
// archivo la lectura usa el lector DETERMINISTA, sin red. En el resto de las
// pruebas está apagada (tests/setup.ts).
vi.hoisted(() => {
  process.env.LECTURA_PROVEEDOR = "determinista";
});

/*
  Lectura automática de documentos, con el lector DETERMINISTA: ninguna de
  estas pruebas envía un documento a Google (tests/setup.ts lo fuerza y
  además corta cualquier fetch a googleapis.com).

  REGLA CENTRAL que se prueba acá: nada se aprueba sin un administrador.
*/

const CONTRASENA = "contrasena-segura-123";
const RUT = "12345678-5";
const VIGENTE = "2030-12-31";

function lector(): LectorDeterminista {
  const actual = obtenerLectorDocumentos();
  if (!(actual instanceof LectorDeterminista)) throw new Error("Las pruebas deben usar el lector determinista.");
  return actual;
}

function enMemoria(almacenamiento: unknown): AlmacenamientoEnMemoria {
  if (!(almacenamiento instanceof AlmacenamientoEnMemoria)) throw new Error("Las pruebas deben usar el almacenamiento en memoria.");
  return almacenamiento;
}
const cedulas = () => enMemoria(obtenerAlmacenamiento());
const certificados = () => enMemoria(obtenerAlmacenamientoCertificaciones());

async function vaciar() {
  // Antes de borrar: que no quede una lectura en segundo plano escribiendo.
  await esperarLecturasEnCurso();
  // TRUNCATE: las bitácoras rechazan DELETE. revisiones_extraccion no cuelga de usuarios.
  await prisma.$executeRaw`TRUNCATE usuarios, revisiones_extraccion CASCADE`;
  cedulas().vaciar();
  certificados().vaciar();
  lector().reiniciar();
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});
beforeEach(vaciar);
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { nombre?: string; rut?: string | null } = {}) {
  secuencia += 1;
  const correo = `lectura${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: opciones.nombre ?? `Persona ${secuencia}`,
      rol,
      rut: opciones.rut ?? null,
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

async function crearPrestador(nombre = "Pedro Soto", rut = RUT) {
  const prestador = await crearUsuario("PRESTADOR", { nombre, rut });
  await prisma.perfilPrestador.create({ data: { usuarioId: prestador.id, comunaId: 13101 } });
  return prestador;
}

const crearAdmin = () => crearUsuario("ADMINISTRADOR");

/** El contenido tal como queda guardado (sin metadatos): es lo que recibe el lector. */
const CEDULA = jpgConExif();
const CEDULA_GUARDADA = quitarMetadatos(CEDULA, "jpg");
const CERTIFICADO = pngConTexto();
const CERTIFICADO_GUARDADO = quitarMetadatos(CERTIFICADO, "png");

function subirCedula(token: string, contenido = CEDULA) {
  return request(app)
    .post("/prestadores/yo/identidad")
    .set("Authorization", `Bearer ${token}`)
    .attach("documento", contenido, { filename: "cedula.jpg", contentType: "image/jpeg" });
}

function subirCertificado(token: string, campos: Record<string, string> = { tipo: "SEC_INSTALADOR_GAS", identificador: "SEC-2024-001", vigenteHasta: VIGENTE }) {
  let solicitud = request(app).post("/prestadores/yo/certificaciones").set("Authorization", `Bearer ${token}`);
  for (const [campo, valor] of Object.entries(campos)) solicitud = solicitud.field(campo, valor);
  return solicitud.attach("documento", CERTIFICADO, { filename: "certificado.png", contentType: "image/png" });
}

const idCedula = async (prestadorId: string) =>
  (await prisma.credencial.findFirstOrThrow({ where: { prestador: { usuarioId: prestadorId }, tipo: { codigo: "IDENTIDAD" } } })).id;

const extraccionDe = (credencialId: string) => prisma.extraccionDocumento.findUnique({ where: { credencialId } });

function verExtraccion(token: string | null, credencialId: string) {
  const solicitud = request(app).get(`/admin/extracciones/${credencialId}`);
  return token ? solicitud.set("Authorization", `Bearer ${token}`) : solicitud;
}

type Revision = { campo: string; resultado: "ACEPTADO" | "CORREGIDO" }[];

function aprobarIdentidad(token: string, id: string, revision?: Revision) {
  const solicitud = request(app).patch(`/admin/identidades/${id}/aprobar`).set("Authorization", `Bearer ${token}`);
  return revision ? solicitud.send({ revision }) : solicitud;
}

function aprobarCertificado(token: string, id: string, revision?: Revision) {
  const solicitud = request(app).patch(`/admin/certificaciones/${id}/aprobar`).set("Authorization", `Bearer ${token}`);
  return revision ? solicitud.send({ revision }) : solicitud;
}

/** Una cédula subida y ya leída, con lo que el lector «leyó» de ella. */
async function cedulaLeida(campos: { campo: string; valor: string; confianza: number }[], prestador?: Awaited<ReturnType<typeof crearPrestador>>) {
  const dueno = prestador ?? (await crearPrestador());
  lector().programar(CEDULA_GUARDADA, campos);
  expect((await subirCedula(dueno.token)).status).toBe(201);
  await esperarLecturasEnCurso();
  return { prestador: dueno, id: await idCedula(dueno.id) };
}

const LECTURA_CORRECTA = [
  { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.96 },
  { campo: "rut", valor: "12.345.678-5", confianza: 0.93 },
];

describe("Al subir un documento", () => {
  it("subir un certificado crea la solicitud sin esperar al lector, y la extracción queda pendiente y luego completada", async () => {
    const prestador = await crearPrestador();
    lector().programar(CERTIFICADO_GUARDADO, [
      { campo: "nombre", valor: "Pedro Soto", confianza: 0.9 },
      { campo: "titulo", valor: "Instalador de gas clase 3", confianza: 0.88 },
      { campo: "institucion", valor: "SEC", confianza: 0.95 },
      { campo: "fechaVencimiento", valor: "2030-12-31", confianza: 0.4 },
    ]);
    // Un lector lento: si la respuesta lo esperara, tardaría más que esto.
    const original = lector().leer.bind(lector());
    let terminoElLector = false;
    vi.spyOn(lector(), "leer").mockImplementation(async (documento, tipo) => {
      await new Promise((resolver) => setTimeout(resolver, 400));
      terminoElLector = true;
      return original(documento, tipo);
    });

    const respuesta = await subirCertificado(prestador.token);

    expect(respuesta.status).toBe(201);
    // La respuesta llegó antes de que el lector terminara.
    expect(terminoElLector).toBe(false);
    const id = String(respuesta.body.certificacion.id);
    expect(await extraccionDe(id)).toMatchObject({ tipo: "CERTIFICADO", estado: "PENDIENTE", campos: null });

    await esperarLecturasEnCurso();

    const extraccion = await extraccionDe(id);
    expect(extraccion).toMatchObject({ estado: "EXTRAIDA", modelo: "determinista-v1", intentos: 1 });
    expect(extraccion?.campos).toEqual([
      { campo: "nombre", valor: "Pedro Soto", confianza: 0.9 },
      { campo: "titulo", valor: "Instalador de gas clase 3", confianza: 0.88 },
      { campo: "institucion", valor: "SEC", confianza: 0.95 },
      { campo: "fechaVencimiento", valor: "2030-12-31", confianza: 0.4 },
    ]);
    // Leer el documento no cambia la solicitud: sigue pendiente de un administrador.
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
  });

  it("un curso se lee como CURSO y una cédula como CEDULA", async () => {
    const prestador = await crearPrestador();
    const curso = await subirCertificado(prestador.token, { tipo: "CURSO", nombre: "Soldadura al arco", emisor: "INACAP", fechaTermino: "2025-03-15", horas: "120" });
    await subirCedula(prestador.token);
    await esperarLecturasEnCurso();

    expect((await extraccionDe(String(curso.body.certificacion.id)))?.tipo).toBe("CURSO");
    expect((await extraccionDe(await idCedula(prestador.id)))?.tipo).toBe("CEDULA");
  });

  it("si el lector falla, la solicitud se crea igual y la extracción queda FALLIDA", async () => {
    const prestador = await crearPrestador();
    vi.spyOn(lector(), "leer").mockRejectedValue(new Error("Gemini respondió 503."));
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const respuesta = await subirCedula(prestador.token);
    await esperarLecturasEnCurso();

    expect(respuesta.status).toBe(201);
    const id = await idCedula(prestador.id);
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
    expect(await extraccionDe(id)).toMatchObject({ estado: "FALLIDA", campos: null, error: "Gemini respondió 503.", intentos: 1 });
    // El documento sigue ahí: el administrador lo revisa a mano, como siempre.
    expect(cedulas().existe(id)).toBe(true);
    // El fallo queda registrado con el id y el motivo; nunca con el documento.
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("No se pudo leer el documento"), { credencialId: id }, "Gemini respondió 503.");
  });
});

describe("Minimización: qué se guarda de cada documento", () => {
  it("de una CEDULA solo se guardan nombre y RUT, NINGÚN otro campo, aunque el lector devuelva más", async () => {
    const { id } = await cedulaLeida([
      ...LECTURA_CORRECTA,
      { campo: "domicilio", valor: "Av. Siempre Viva 742, Ñuñoa", confianza: 0.9 },
      { campo: "fechaNacimiento", valor: "1985-04-12", confianza: 0.9 },
      { campo: "nacionalidad", valor: "Chilena", confianza: 0.9 },
      { campo: "numeroDocumento", valor: "123.456.789", confianza: 0.9 },
      // Campos válidos para un certificado, no para una cédula.
      { campo: "fechaEmision", valor: "2020-01-01", confianza: 0.9 },
      { campo: "fechaVencimiento", valor: "2030-01-01", confianza: 0.9 },
    ]);

    const extraccion = await extraccionDe(id);
    expect(extraccion?.campos).toEqual(LECTURA_CORRECTA);
    const guardado = JSON.stringify(extraccion);
    for (const prohibido of ["Siempre Viva", "1985", "Chilena", "123.456.789", "2030-01-01", "domicilio", "nacionalidad"]) {
      expect(guardado).not.toContain(prohibido);
    }
    // Tampoco sale por la API.
    const respuesta = await verExtraccion((await crearAdmin()).token, id);
    expect(respuesta.body.extraccion.campos.map((campo: { campo: string }) => campo.campo)).toEqual(["nombre", "rut"]);
    expect(respuesta.text).not.toContain("Siempre Viva");
  });

  it("la base rechaza guardar en la extracción de una cédula un campo que no sea nombre o RUT", async () => {
    const { id } = await cedulaLeida(LECTURA_CORRECTA);

    await expect(
      prisma.extraccionDocumento.update({
        where: { credencialId: id },
        data: { campos: [...LECTURA_CORRECTA, { campo: "domicilio", valor: "Av. Siempre Viva 742", confianza: 0.9 }] },
      }),
    ).rejects.toThrow("extracciones_documento_cedula_minima");
  });
});

describe("Validación cruzada", () => {
  it("un RUT leído distinto al declarado genera una alerta, con los dos valores", async () => {
    const { id } = await cedulaLeida([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.95 },
      { campo: "rut", valor: "9.876.543-3", confianza: 0.97 },
    ]);

    const respuesta = await verExtraccion((await crearAdmin()).token, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.extraccion.alertas).toEqual([
      { campo: "rut", mensaje: "El RUT leído del documento NO coincide con el RUT de la cuenta.", declarado: RUT, leido: "9.876.543-3" },
    ]);
  });

  it("un nombre que difiere de forma significativa genera una alerta; el mismo nombre en otro orden o con segundo nombre, no", async () => {
    const admin = await crearAdmin();
    const otraPersona = await cedulaLeida([
      { campo: "nombre", valor: "RAMÍREZ DÍAZ JUAN CARLOS", confianza: 0.95 },
      { campo: "rut", valor: RUT, confianza: 0.95 },
    ]);
    expect((await verExtraccion(admin.token, otraPersona.id)).body.extraccion.alertas).toEqual([
      expect.objectContaining({ campo: "nombre", declarado: "Pedro Soto", leido: "RAMÍREZ DÍAZ JUAN CARLOS" }),
    ]);

    await vaciar();
    const admin2 = await crearAdmin();
    const misma = await cedulaLeida(LECTURA_CORRECTA);
    expect((await verExtraccion(admin2.token, misma.id)).body.extraccion.alertas).toEqual([]);
  });

  it("el RUT se compara sin puntos, guion ni mayúsculas: «12.345.678-5» es «12345678-5»", async () => {
    const prestador = await crearPrestador("Ana Rojas", "11111111-K");
    const { id } = await cedulaLeida(
      [
        { campo: "nombre", valor: "Ana Rojas", confianza: 0.9 },
        { campo: "rut", valor: "11.111.111-k", confianza: 0.9 },
      ],
      prestador,
    );

    expect((await verExtraccion((await crearAdmin()).token, id)).body.extraccion.alertas).toEqual([]);
  });

  it("la alerta no impide aprobar: el administrador decide igual, y queda quién aprobó", async () => {
    const admin = await crearAdmin();
    const { prestador, id } = await cedulaLeida([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.95 },
      { campo: "rut", valor: "9.876.543-3", confianza: 0.3 },
    ]);
    expect((await verExtraccion(admin.token, id)).body.extraccion.alertas).toHaveLength(1);

    const respuesta = await aprobarIdentidad(admin.token, id, [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "rut", resultado: "CORREGIDO" },
    ]);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.identidad.estado).toBe("VERIFICADA");
    expect(await prisma.credencial.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: "VERIFICADA", verificadoPorId: admin.id, metodo: "MANUAL" });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: prestador.id } })).rutVerificado).toBe(true);
  });

  it("los campos bajo el umbral de confianza se marcan para destacarlos", async () => {
    const { id } = await cedulaLeida([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.96 },
      { campo: "rut", valor: "12.345.678-5", confianza: 0.41 },
    ]);

    const { body } = await verExtraccion((await crearAdmin()).token, id);

    expect(body.extraccion.campos).toEqual([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.96, confianzaBaja: false },
      { campo: "rut", valor: "12.345.678-5", confianza: 0.41, confianzaBaja: true },
    ]);
  });
});

describe("Quién puede ver una extracción", () => {
  it("un prestador (ni siquiera el dueño del documento) o un cliente recibe 403; sin sesión, 401", async () => {
    const { prestador, id } = await cedulaLeida(LECTURA_CORRECTA);
    const otroPrestador = await crearPrestador("Otra Persona", "9876543-3");
    const cliente = await crearUsuario("CLIENTE");

    for (const token of [prestador.token, otroPrestador.token, cliente.token]) {
      const respuesta = await verExtraccion(token, id);
      expect(respuesta.status).toBe(403);
      expect(respuesta.text).not.toContain("12.345.678-5");
      expect(respuesta.text).not.toContain("SOTO");
    }
    expect((await verExtraccion(null, id)).status).toBe(401);
  });

  it("el administrador la ve, sin caché; una solicitud que no existe es 404; sin lectura, extraccion: null", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);

    const respuesta = await verExtraccion(admin.token, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["cache-control"]).toBe("no-store");
    expect(respuesta.body.extraccion).toMatchObject({ tipo: "CEDULA", estado: "EXTRAIDA", modelo: "determinista-v1" });
    expect((await verExtraccion(admin.token, "no-existe")).status).toBe(404);

    // Una solicitud anterior a la lectura automática: el panel funciona a mano.
    await prisma.extraccionDocumento.delete({ where: { credencialId: id } });
    expect((await verExtraccion(admin.token, id)).body).toEqual({ extraccion: null });
  });

  it("el estado propio del prestador y la cola no exponen lo leído", async () => {
    const { prestador } = await cedulaLeida([
      { campo: "nombre", valor: "NOMBRE-LEIDO-DEL-DOCUMENTO", confianza: 0.9 },
      { campo: "rut", valor: "9.876.543-3", confianza: 0.9 },
    ]);

    const propio = await request(app).get("/prestadores/yo/identidad").set("Authorization", `Bearer ${prestador.token}`);

    expect(propio.text).not.toContain("NOMBRE-LEIDO-DEL-DOCUMENTO");
    expect(propio.text).not.toContain("9.876.543-3");
    expect(propio.text).not.toContain("extraccion");
  });
});

describe("REGLA CENTRAL: un documento nunca se aprueba sin un administrador", () => {
  it("una lectura perfecta (todo coincide, confianza 1) NO aprueba nada: la solicitud sigue PENDIENTE", async () => {
    const { prestador, id } = await cedulaLeida([
      { campo: "nombre", valor: "Pedro Soto", confianza: 1 },
      { campo: "rut", valor: RUT, confianza: 1 },
    ]);

    // Ni al leer, ni al volver a correr el script, ni al consultar la extracción.
    await leerPendientes();
    await verExtraccion((await crearAdmin()).token, id);

    expect(await prisma.credencial.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: "PENDIENTE", verificadoPorId: null, metodo: null });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: prestador.id } })).rutVerificado).toBe(false);
    expect(await prisma.eventoCredencial.count({ where: { credencialId: id, estadoNuevo: "VERIFICADA" } })).toBe(0);
    // El documento sigue guardado: nadie lo revisó todavía.
    expect(cedulas().existe(id)).toBe(true);
  });

  it("aprobar exige un administrador autenticado: prestador y cliente reciben 403, sin sesión 401, y nada cambia", async () => {
    const { prestador, id } = await cedulaLeida(LECTURA_CORRECTA);
    const cliente = await crearUsuario("CLIENTE");
    const revision: Revision = [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "rut", resultado: "ACEPTADO" },
    ];

    expect((await aprobarIdentidad(prestador.token, id, revision)).status).toBe(403);
    expect((await aprobarIdentidad(cliente.token, id, revision)).status).toBe(403);
    expect((await request(app).patch(`/admin/identidades/${id}/aprobar`).send({ revision })).status).toBe(401);
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
    expect(await extraccionDe(id)).not.toBeNull();
  });

  it("no existe ninguna ruta de extracciones que escriba: solo GET (POST, PUT, PATCH y DELETE responden 404)", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);

    for (const metodo of ["post", "put", "patch", "delete"] as const) {
      for (const ruta of [`/admin/extracciones/${id}`, `/admin/extracciones/${id}/aprobar`]) {
        const respuesta = await request(app)[metodo](ruta).set("Authorization", `Bearer ${admin.token}`).send({ estado: "VERIFICADA" });
        expect(respuesta.status).toBe(404);
      }
    }
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
  });

  it("en el código, solo las dos decisiones de un administrador escriben el estado aprobado; el módulo de lectura no toca credenciales", () => {
    const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
    const archivos = (readdirSync(raiz, { recursive: true, encoding: "utf8" }) as string[])
      .map((ruta) => ruta.replaceAll("\\", "/"))
      .filter((ruta) => ruta.endsWith(".ts") && !ruta.startsWith("generated/"));
    const contenido = (ruta: string) => readFileSync(raiz + ruta, "utf8");

    // 1. Archivos que escriben en la tabla de credenciales.
    const escribenCredenciales = archivos.filter((ruta) => /\bcredencial\.(update|updateMany|upsert|create|createMany)\(/.test(contenido(ruta))).sort();
    expect(escribenCredenciales).toEqual(["modules/certificaciones/certificaciones.repository.ts", "modules/identidad/identidad.repository.ts"]);

    // 2. Las únicas funciones que fijan el estado desde una decisión, y quién las llama.
    for (const [repositorio, funcion, servicio, controlador] of [
      ["modules/identidad/identidad.repository.ts", "resolverIdentidad", "modules/identidad/identidad.service.ts", "modules/identidad/identidad.controller.ts"],
      ["modules/certificaciones/certificaciones.repository.ts", "resolverCertificacion", "modules/certificaciones/certificaciones.service.ts", "modules/certificaciones/certificaciones.controller.ts"],
    ] as const) {
      expect(contenido(repositorio)).toContain(`export async function ${funcion}(`);
      const llaman = archivos.filter((ruta) => ruta !== repositorio && contenido(ruta).includes(`${funcion}(`));
      expect(llaman).toEqual([servicio]);
      // La decisión lleva siempre el id del administrador, que sale del token en el controlador.
      expect(contenido(servicio)).toContain('estado: "VERIFICADA", administradorId');
      expect(contenido(controlador)).toContain("idDelUsuario(req)");
    }

    // 3. Las rutas que aprueban están detrás de autorizar(ADMINISTRADOR).
    for (const rutas of ["modules/identidad/identidad.routes.ts", "modules/certificaciones/certificaciones.routes.ts"]) {
      const texto = contenido(rutas);
      const guardia = texto.search(/Admin\.use\(autenticar, autorizar\(Rol\.ADMINISTRADOR\)\)/);
      const aprobar = texto.search(/Admin\.patch\("\/:id\/aprobar"/);
      expect(guardia).toBeGreaterThan(-1);
      expect(aprobar).toBeGreaterThan(guardia);
    }

    // 4. El módulo de lectura y el script nocturno no escriben credenciales, no
    //    nombran el estado aprobado y no importan nada que apruebe.
    const lectura = archivos.filter((ruta) => ruta.startsWith("modules/lectura-documentos/") || ruta === "scripts/procesarExtracciones.ts");
    expect(lectura.length).toBeGreaterThan(5);
    for (const ruta of lectura) {
      const texto = contenido(ruta);
      const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(codigo, ruta).not.toMatch(/\bcredencial\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\(/);
      expect(codigo, ruta).not.toMatch(/resolverIdentidad|resolverCertificacion|aprobarIdentidad|rutVerificado/);
      expect(codigo, ruta).not.toMatch(/import[^;]*from "\.\.\/(identidad|certificaciones)\//);
      // "VERIFICADA" solo puede aparecer como el tipo de la decisión que YA tomó un administrador (cerrarExtraccion).
      if (ruta !== "modules/lectura-documentos/lectura.repository.ts") expect(codigo, ruta).not.toContain("VERIFICADA");
    }
  });
});

describe("Al resolver la solicitud", () => {
  it("aprobar la verificación de identidad elimina el documento Y su extracción: el RUT leído no queda en ninguna tabla", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida([
      { campo: "nombre", valor: "SOTO PÉREZ PEDRO ANTONIO", confianza: 0.96 },
      { campo: "rut", valor: "12.345.678-5", confianza: 0.93 },
    ]);
    expect(cedulas().existe(id)).toBe(true);
    expect(await extraccionDe(id)).not.toBeNull();

    const respuesta = await aprobarIdentidad(admin.token, id, [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "rut", resultado: "ACEPTADO" },
    ]);

    expect(respuesta.status).toBe(200);
    expect(cedulas().existe(id)).toBe(false);
    expect(await extraccionDe(id)).toBeNull();
    expect(await prisma.extraccionDocumento.count()).toBe(0);
    // Lo que queda (la evidencia de precisión) no tiene valores ni forma de llegar a la persona.
    const revisiones = await prisma.revisionExtraccion.findMany();
    const texto = JSON.stringify(revisiones);
    expect(texto).not.toContain("12.345.678-5");
    expect(texto).not.toContain("SOTO");
    expect(texto).not.toContain(id);
    expect(Object.keys(revisiones[0] ?? {}).sort()).toEqual(["campo", "confianza", "creadoEn", "decision", "id", "lote", "modelo", "resultado", "tipoDocumento"]);
  });

  it("rechazar también elimina el documento y su extracción", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);

    const respuesta = await request(app)
      .patch(`/admin/identidades/${id}/rechazar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ motivo: "La foto está borrosa y no se lee el RUT." });

    expect(respuesta.status).toBe(200);
    expect(cedulas().existe(id)).toBe(false);
    expect(await extraccionDe(id)).toBeNull();
  });

  it("se registra qué campos aceptó tal cual y cuáles corrigió el administrador", async () => {
    const admin = await crearAdmin();
    const prestador = await crearPrestador();
    lector().programar(CERTIFICADO_GUARDADO, [
      { campo: "nombre", valor: "Pedro Soto", confianza: 0.9 },
      { campo: "titulo", valor: "Instalador de gas clase 8", confianza: 0.55 },
      { campo: "institucion", valor: "SEC", confianza: 0.95 },
    ]);
    const subida = await subirCertificado(prestador.token);
    await esperarLecturasEnCurso();
    const id = String(subida.body.certificacion.id);

    const respuesta = await aprobarCertificado(admin.token, id, [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "titulo", resultado: "CORREGIDO" },
      { campo: "institucion", resultado: "ACEPTADO" },
    ]);

    expect(respuesta.status).toBe(200);
    const revisiones = await prisma.revisionExtraccion.findMany({ orderBy: { campo: "asc" } });
    expect(revisiones.map(({ campo, resultado, confianza, tipoDocumento, modelo, decision }) => ({ campo, resultado, confianza, tipoDocumento, modelo, decision }))).toEqual([
      { campo: "institucion", resultado: "ACEPTADO", confianza: 0.95, tipoDocumento: "CERTIFICADO", modelo: "determinista-v1", decision: "VERIFICADA" },
      { campo: "nombre", resultado: "ACEPTADO", confianza: 0.9, tipoDocumento: "CERTIFICADO", modelo: "determinista-v1", decision: "VERIFICADA" },
      { campo: "titulo", resultado: "CORREGIDO", confianza: 0.55, tipoDocumento: "CERTIFICADO", modelo: "determinista-v1", decision: "VERIFICADA" },
    ]);
    // Los tres campos de un mismo documento comparten lote.
    expect(new Set(revisiones.map((revision) => revision.lote)).size).toBe(1);
    expect(certificados().existe(id)).toBe(false);
    expect(await extraccionDe(id)).toBeNull();
  });

  it("no se aprueba en bloque: con campos leídos, aprobar sin revisar cada uno responde 400 y nada cambia", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);

    const sinRevision = await aprobarIdentidad(admin.token, id);
    const incompleta = await aprobarIdentidad(admin.token, id, [{ campo: "nombre", resultado: "ACEPTADO" }]);

    expect(sinRevision.status).toBe(400);
    expect(sinRevision.body.error.codigo).toBe("REVISION_INCOMPLETA");
    expect(incompleta.status).toBe(400);
    expect(incompleta.body.error.detalles).toEqual([{ campo: "rut", mensaje: "Falta confirmar o corregir este campo." }]);
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
    expect(cedulas().existe(id)).toBe(true);
    expect(await extraccionDe(id)).not.toBeNull();
    expect(await prisma.revisionExtraccion.count()).toBe(0);
  });

  it("si la lectura está pendiente o falló, el flujo manual de siempre funciona igual: se aprueba sin revisión de campos", async () => {
    const admin = await crearAdmin();
    const prestador = await crearPrestador();
    vi.spyOn(lector(), "leer").mockRejectedValue(new Error("Gemini respondió 503."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await subirCedula(prestador.token);
    await esperarLecturasEnCurso();
    const id = await idCedula(prestador.id);
    expect((await extraccionDe(id))?.estado).toBe("FALLIDA");
    expect((await verExtraccion(admin.token, id)).body.extraccion).toMatchObject({ estado: "FALLIDA", campos: [], alertas: [] });

    const respuesta = await aprobarIdentidad(admin.token, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.identidad.estado).toBe("VERIFICADA");
    expect(await extraccionDe(id)).toBeNull();
    expect(await prisma.revisionExtraccion.count()).toBe(0);
  });

  it("la evidencia de precisión no se puede modificar ni borrar", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);
    await aprobarIdentidad(admin.token, id, [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "rut", resultado: "CORREGIDO" },
    ]);
    const revision = await prisma.revisionExtraccion.findFirstOrThrow({ where: { campo: "rut" } });

    await expect(prisma.revisionExtraccion.update({ where: { id: revision.id }, data: { resultado: "ACEPTADO" } })).rejects.toThrow();
    await expect(prisma.revisionExtraccion.delete({ where: { id: revision.id } })).rejects.toThrow();
  });
});

describe("Script de pendientes", () => {
  it("es idempotente: lee lo que quedó pendiente o falló, y una segunda corrida no hace ninguna llamada", async () => {
    const prestador = await crearPrestador();
    const otro = await crearPrestador("Carolina Muñoz", "9876543-3");
    // Al subir, el lector está caído: las dos quedan FALLIDA.
    const caido = vi.spyOn(lector(), "leer").mockRejectedValue(new Error("Gemini respondió 503."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await subirCedula(prestador.token);
    await subirCertificado(otro.token);
    await esperarLecturasEnCurso();
    expect(await prisma.extraccionDocumento.count({ where: { estado: "FALLIDA" } })).toBe(2);
    caido.mockRestore();
    const espia = vi.spyOn(lector(), "leer");

    const primera = await leerPendientes({ lote: 1 });

    expect(primera).toEqual({ porLeer: 2, extraidas: 2, fallidas: 0, omitidas: 0 });
    expect(espia).toHaveBeenCalledTimes(2);
    expect(await prisma.extraccionDocumento.count({ where: { estado: "EXTRAIDA" } })).toBe(2);
    const guardado = await prisma.extraccionDocumento.findMany({ orderBy: { credencialId: "asc" } });

    const segunda = await leerPendientes({ lote: 1 });

    expect(segunda).toEqual({ porLeer: 0, extraidas: 0, fallidas: 0, omitidas: 0 });
    expect(espia).toHaveBeenCalledTimes(2);
    expect(await prisma.extraccionDocumento.findMany({ orderBy: { credencialId: "asc" } })).toEqual(guardado);
  });

  it("retoma una solicitud pendiente que nunca tuvo extracción registrada", async () => {
    const prestador = await crearPrestador();
    await subirCedula(prestador.token);
    await esperarLecturasEnCurso();
    const id = await idCedula(prestador.id);
    await prisma.extraccionDocumento.delete({ where: { credencialId: id } });

    const resultado = await leerPendientes();

    expect(resultado).toMatchObject({ porLeer: 1, extraidas: 1 });
    expect((await extraccionDe(id))?.estado).toBe("EXTRAIDA");
  });

  it("un documento que falla siempre se intenta a lo más 3 veces en total y después no se vuelve a llamar", async () => {
    const prestador = await crearPrestador();
    const espia = vi.spyOn(lector(), "leer").mockRejectedValue(new Error("Gemini rechazó la lectura del documento (400)."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await subirCedula(prestador.token);
    await esperarLecturasEnCurso();
    expect(espia).toHaveBeenCalledTimes(1);

    for (let corrida = 0; corrida < 4; corrida += 1) await leerPendientes();

    expect(espia).toHaveBeenCalledTimes(3);
    expect(await extraccionDe(await idCedula(prestador.id))).toMatchObject({ estado: "FALLIDA", intentos: 3 });
  });

  it("no lee el documento de una solicitud ya resuelta", async () => {
    const admin = await crearAdmin();
    const { id } = await cedulaLeida(LECTURA_CORRECTA);
    await aprobarIdentidad(admin.token, id, [
      { campo: "nombre", resultado: "ACEPTADO" },
      { campo: "rut", resultado: "ACEPTADO" },
    ]);
    const espia = vi.spyOn(lector(), "leer");

    const resultado = await leerPendientes();

    expect(resultado.porLeer).toBe(0);
    expect(espia).not.toHaveBeenCalled();
    expect(await extraccionDe(id)).toBeNull();
  });
});

describe("Documentos PDF", () => {
  it("un PDF también se lee", async () => {
    const prestador = await crearPrestador();
    const respuesta = await request(app)
      .post("/prestadores/yo/identidad")
      .set("Authorization", `Bearer ${prestador.token}`)
      .attach("documento", pdfMinimo(), { filename: "cedula.pdf", contentType: "application/pdf" });
    await esperarLecturasEnCurso();

    expect(respuesta.status).toBe(201);
    expect((await extraccionDe(await idCedula(prestador.id)))?.estado).toBe("EXTRAIDA");
  });
});
