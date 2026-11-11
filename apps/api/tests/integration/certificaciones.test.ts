import { Algorithm, hash } from "@node-rs/argon2";
import { MAXIMO_CERTIFICACIONES_POR_DIA } from "@localcl/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { AlmacenamientoEnMemoria, obtenerAlmacenamientoCertificaciones } from "../../src/modules/almacenamiento/index.js";
import { jpgConExif, pdfMinimo } from "../archivos.js";

const CONTRASENA = "contrasena-segura-123";
const VIGENTE = "2030-12-31";

/** Las pruebas corren con el almacenamiento en memoria: nada sale a la red. */
function almacenamiento(): AlmacenamientoEnMemoria {
  const actual = obtenerAlmacenamientoCertificaciones();
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

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; rutVerificado?: boolean } = {}) {
  secuencia += 1;
  const correo = `certificaciones${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      rut: rol === "PRESTADOR" ? `${10000000 + secuencia}-K` : null,
      rutVerificado: opciones.rutVerificado ?? false,
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

/** Prestador con perfil y, por defecto, un servicio publicado y visible. */
async function crearPrestador(opciones: { correoVerificado?: boolean; conServicio?: boolean } = {}) {
  const conServicio = opciones.conServicio ?? true;
  const usuario = await crearUsuario("PRESTADOR", { correoVerificado: opciones.correoVerificado, rutVerificado: conServicio });
  const perfil = await prisma.perfilPrestador.create({
    data: { usuarioId: usuario.id, comunaId: 13101, descripcion: "Gasfíter con quince años de oficio en Santiago.", telefono: "+56912345678" },
  });
  if (conServicio) {
    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
    await prisma.servicio.create({
      data: {
        prestadorId: perfil.id,
        categoriaId: categoria.id,
        titulo: "Reparación de calefont",
        descripcion: "Mantención y reparación de calefont a domicilio.",
        estado: "PUBLICADO",
        precioDesde: 25000,
        unidadPrecio: "POR_SERVICIO",
      },
    });
  }
  return { ...usuario, perfilId: perfil.id };
}

const crearAdministrador = () => crearUsuario("ADMINISTRADOR");

interface Campos {
  tipo?: string;
  identificador?: string;
  vigenteHasta?: string;
  nombre?: string;
  emisor?: string;
  fechaTermino?: string;
  horas?: string;
}

function subir(
  token: string,
  campos: Campos = { tipo: "SEC_INSTALADOR_GAS", identificador: "SEC-2024-001", vigenteHasta: VIGENTE },
  archivo: Buffer | null = jpgConExif(),
) {
  let solicitud = request(app).post("/prestadores/yo/certificaciones").set("Authorization", `Bearer ${token}`);
  for (const [campo, valor] of Object.entries(campos)) solicitud = solicitud.field(campo, valor);
  if (archivo) solicitud = solicitud.attach("documento", archivo, { filename: "certificado.jpg", contentType: "image/jpeg" });
  return solicitud;
}

function propias(token: string) {
  return request(app).get("/prestadores/yo/certificaciones").set("Authorization", `Bearer ${token}`);
}

function cola(token: string, consulta = "") {
  return request(app).get(`/admin/certificaciones${consulta}`).set("Authorization", `Bearer ${token}`);
}

function documento(token: string, id: string) {
  return request(app).get(`/admin/certificaciones/${id}/documento`).set("Authorization", `Bearer ${token}`);
}

function aprobar(token: string, id: string) {
  return request(app).patch(`/admin/certificaciones/${id}/aprobar`).set("Authorization", `Bearer ${token}`);
}

function rechazar(token: string, id: string, motivo = "El folio no coincide con el registro de la SEC.") {
  return request(app).patch(`/admin/certificaciones/${id}/rechazar`).set("Authorization", `Bearer ${token}`).send({ motivo });
}

function perfilPublico(prestadorId: string) {
  return request(app).get(`/prestadores/${prestadorId}/publico`);
}

function detalleDe(cuerpo: { error?: { detalles?: { campo: string; mensaje: string }[] } }, campo: string) {
  return cuerpo.error?.detalles?.find((detalle) => detalle.campo === campo)?.mensaje;
}

/** Sube una certificación y la deja aprobada por un administrador. */
async function certificacionAprobada(prestador: { token: string }, campos?: Campos) {
  const subida = await subir(prestador.token, campos);
  expect(subida.status).toBe(201);
  const administrador = await crearAdministrador();
  expect((await aprobar(administrador.token, subida.body.certificacion.id)).status).toBe(200);
  return subida.body.certificacion.id as string;
}

describe("GET /certificaciones/tipos", () => {
  it("es público y ofrece el catálogo sin la cédula, con «Otra certificación»", async () => {
    const respuesta = await request(app).get("/certificaciones/tipos");

    expect(respuesta.status).toBe(200);
    const codigos = respuesta.body.tipos.map((tipo: { codigo: string }) => tipo.codigo);
    expect(codigos).toContain("SEC_INSTALADOR_GAS");
    expect(codigos).toContain("OTRA");
    expect(codigos).not.toContain("IDENTIDAD");
  });
});

describe("POST /prestadores/yo/certificaciones", () => {
  it("carga válida: queda PENDIENTE, con su evento, y el archivo se guarda con el id", async () => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.certificacion).toMatchObject({
      tipo: "SEC_INSTALADOR_GAS",
      nombre: "Instalador de gas autorizado (SEC)",
      identificador: "SEC-2024-001",
      estado: "PENDIENTE",
      vigenteHasta: `${VIGENTE}T00:00:00.000Z`,
    });
    const id = respuesta.body.certificacion.id;
    expect(await prisma.eventoCredencial.findMany({ where: { credencialId: id } })).toEqual([
      expect.objectContaining({ estadoAnterior: null, estadoNuevo: "PENDIENTE", autorId: prestador.id }),
    ]);
    expect(almacenamiento().existe(id)).toBe(true);
  });

  it("guarda el archivo sin EXIF", async () => {
    const prestador = await crearPrestador();

    const { body } = await subir(prestador.token);

    expect(almacenamiento().contenido(body.certificacion.id)?.includes("GPS-SECRETO")).toBe(false);
  });

  it("el estado lo fija el servidor: un «estado» en el formulario se ignora", async () => {
    const prestador = await crearPrestador();

    const respuesta = await request(app)
      .post("/prestadores/yo/certificaciones")
      .set("Authorization", `Bearer ${prestador.token}`)
      .field("tipo", "SEC_INSTALADOR_GAS")
      .field("identificador", "SEC-2024-001")
      .field("vigenteHasta", VIGENTE)
      .field("estado", "VERIFICADA")
      .attach("documento", pdfMinimo(), { filename: "c.pdf", contentType: "application/pdf" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.certificacion.estado).toBe("PENDIENTE");
  });

  it("«Otra certificación» exige nombre y emisor, y los guarda", async () => {
    const prestador = await crearPrestador();

    const sinNombre = await subir(prestador.token, { tipo: "OTRA", identificador: "INACAP-77" });
    expect(sinNombre.status).toBe(400);
    expect(detalleDe(sinNombre.body, "nombre")).toBeDefined();
    expect(detalleDe(sinNombre.body, "emisor")).toBeDefined();

    const valida = await subir(prestador.token, {
      tipo: "OTRA",
      identificador: "INACAP-77",
      nombre: "Técnico en climatización",
      emisor: "INACAP",
    });
    expect(valida.status).toBe(201);
    expect(valida.body.certificacion).toMatchObject({ tipo: "OTRA", nombre: "Técnico en climatización", emisor: "INACAP" });
  });

  it("con un tipo del catálogo, nombre y emisor los pone el catálogo", async () => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, {
      tipo: "SEC_INSTALADOR_GAS",
      identificador: "SEC-2024-001",
      vigenteHasta: VIGENTE,
      nombre: "Ingeniero nuclear",
      emisor: "NASA",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.certificacion).toMatchObject({
      nombre: "Instalador de gas autorizado (SEC)",
      emisor: "Superintendencia de Electricidad y Combustibles",
    });
  });

  it.each([
    ["sin vigencia en un tipo que vence", { tipo: "SEC_INSTALADOR_GAS", identificador: "SEC-1" }, "vigenteHasta"],
    ["ya vencida", { tipo: "SEC_INSTALADOR_GAS", identificador: "SEC-1", vigenteHasta: "2020-01-01" }, "vigenteHasta"],
    ["con un tipo inexistente", { tipo: "PILOTO_DE_AVION", identificador: "SEC-1" }, "tipo"],
    ["la cédula no se sube por acá", { tipo: "IDENTIDAD", identificador: "12345678-5" }, "tipo"],
    ["sin número", { tipo: "OTRA", nombre: "Curso", emisor: "Liceo" }, "identificador"],
  ])("400 %s", async (_caso, campos, campo) => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, campos);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, campo)).toBeDefined();
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("400 sin archivo o con un archivo que no es imagen ni PDF", async () => {
    const prestador = await crearPrestador();

    const sinArchivo = await subir(prestador.token, undefined, null);
    expect(sinArchivo.status).toBe(400);
    expect(detalleDe(sinArchivo.body, "documento")).toBeDefined();

    const texto = await subir(prestador.token, undefined, Buffer.from("no soy una imagen"));
    expect(texto.status).toBe(400);
    expect(detalleDe(texto.body, "documento")).toBeDefined();
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("409 si la misma certificación ya está en revisión (también con OTRA, sin importar mayúsculas)", async () => {
    const prestador = await crearPrestador();

    expect((await subir(prestador.token)).status).toBe(201);
    const repetida = await subir(prestador.token);
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("CERTIFICACION_PENDIENTE");

    const otra = { tipo: "OTRA", identificador: "INACAP-77", nombre: "Técnico en climatización", emisor: "INACAP" };
    expect((await subir(prestador.token, otra)).status).toBe(201);
    expect((await subir(prestador.token, { ...otra, nombre: "  TÉCNICO en climatización " })).status).toBe(409);
    // Otra distinta sí se acepta.
    expect((await subir(prestador.token, { ...otra, nombre: "Curso de soldadura" })).status).toBe(201);
    expect(almacenamiento().cantidad).toBe(3);
  });

  it(`429 después de ${MAXIMO_CERTIFICACIONES_POR_DIA} envíos en 24 horas`, async () => {
    const prestador = await crearPrestador();

    for (let indice = 0; indice < MAXIMO_CERTIFICACIONES_POR_DIA; indice += 1) {
      const respuesta = await subir(prestador.token, { tipo: "OTRA", identificador: `F-${indice}00`, nombre: `Curso ${indice}`, emisor: "OTEC" });
      expect(respuesta.status).toBe(201);
    }
    const excedida = await subir(prestador.token, { tipo: "OTRA", identificador: "F-999", nombre: "Curso extra", emisor: "OTEC" });

    expect(excedida.status).toBe(429);
    expect(excedida.body.error.codigo).toBe("DEMASIADOS_ENVIOS");
    expect(almacenamiento().cantidad).toBe(MAXIMO_CERTIFICACIONES_POR_DIA);
  });

  it("401 sin sesión, 403 si no es prestador o no confirmó su correo, 409 sin perfil", async () => {
    expect((await request(app).post("/prestadores/yo/certificaciones")).status).toBe(401);

    const cliente = await crearUsuario("CLIENTE");
    expect((await subir(cliente.token)).status).toBe(403);

    const sinCorreo = await crearPrestador({ correoVerificado: false });
    expect((await subir(sinCorreo.token)).status).toBe(403);

    const sinPerfil = await crearUsuario("PRESTADOR");
    const respuesta = await subir(sinPerfil.token);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("PERFIL_REQUERIDO");
    expect(almacenamiento().cantidad).toBe(0);
  });
});

describe("GET /prestadores/yo/certificaciones", () => {
  it("lista solo las propias, con estado y motivo de rechazo", async () => {
    const prestador = await crearPrestador();
    const otro = await crearPrestador();
    const administrador = await crearAdministrador();
    const { body } = await subir(prestador.token);
    await subir(otro.token);
    await rechazar(administrador.token, body.certificacion.id);

    const respuesta = await propias(prestador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.certificaciones).toEqual([
      expect.objectContaining({
        id: body.certificacion.id,
        estado: "RECHAZADA",
        motivoRechazo: "El folio no coincide con el registro de la SEC.",
      }),
    ]);
  });
});

describe("/admin/certificaciones", () => {
  it("la cola muestra las pendientes con nombre y RUT de la cuenta", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    await subir(prestador.token);

    const respuesta = await cola(administrador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.certificaciones[0]).toMatchObject({
      estado: "PENDIENTE",
      identificador: "SEC-2024-001",
      prestador: { id: prestador.perfilId, nombre: prestador.nombre, rut: prestador.rut },
    });
  });

  it("ver el documento entrega una URL de corta duración y deja registrado el acceso", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    const { body } = await subir(prestador.token);

    const respuesta = await documento(administrador.token, body.certificacion.id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["cache-control"]).toBe("no-store");
    expect(respuesta.body.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(await prisma.accesoDocumento.findMany({ where: { credencialId: body.certificacion.id } })).toEqual([
      expect.objectContaining({ administradorId: administrador.id }),
    ]);
  });

  it("aprobar: VERIFICADA, trazable, con su evento, y el documento se elimina", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    const { body } = await subir(prestador.token);
    const id = body.certificacion.id;

    const respuesta = await aprobar(administrador.token, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.certificacion.estado).toBe("VERIFICADA");
    const guardada = await prisma.credencial.findUniqueOrThrow({ where: { id } });
    expect(guardada).toMatchObject({ estado: "VERIFICADA", metodo: "MANUAL", verificadoPorId: administrador.id });
    expect(guardada.fechaConsulta).not.toBeNull();
    expect(await prisma.eventoCredencial.findMany({ where: { credencialId: id }, orderBy: { creadoEn: "asc" } })).toEqual([
      expect.objectContaining({ estadoNuevo: "PENDIENTE" }),
      expect.objectContaining({ estadoAnterior: "PENDIENTE", estadoNuevo: "VERIFICADA", autorId: administrador.id }),
    ]);
    expect(almacenamiento().existe(id)).toBe(false);

    // Revisada: el documento ya no está y no se puede volver a decidir.
    expect((await documento(administrador.token, id)).status).toBe(410);
    expect((await rechazar(administrador.token, id)).status).toBe(409);
  });

  it("rechazar: exige motivo, queda RECHAZADA y el documento se elimina", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    const { body } = await subir(prestador.token);
    const id = body.certificacion.id;

    expect((await rechazar(administrador.token, id, "corto")).status).toBe(400);
    const respuesta = await rechazar(administrador.token, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.certificacion).toMatchObject({ estado: "RECHAZADA", motivoRechazo: "El folio no coincide con el registro de la SEC." });
    expect(almacenamiento().existe(id)).toBe(false);
  });

  it("una renovación aprobada reemplaza a la anterior, que queda REVOCADA", async () => {
    const prestador = await crearPrestador();
    const anterior = await certificacionAprobada(prestador);

    const renovacion = await certificacionAprobada(prestador, {
      tipo: "SEC_INSTALADOR_GAS",
      identificador: "SEC-2026-002",
      vigenteHasta: "2031-06-30",
    });

    expect(await prisma.credencial.findUniqueOrThrow({ where: { id: anterior } })).toMatchObject({ estado: "REVOCADA" });
    expect(await prisma.credencial.findUniqueOrThrow({ where: { id: renovacion } })).toMatchObject({
      estado: "VERIFICADA",
      reemplazaAId: anterior,
    });
    // El prestador ve solo la vigente; el público también.
    expect((await propias(prestador.token)).body.certificaciones.map((c: { id: string }) => c.id)).toEqual([renovacion]);
    expect((await perfilPublico(prestador.perfilId)).body.prestador.certificaciones).toHaveLength(1);
  });

  it("404 con un id que no existe; la cédula no se resuelve por acá", async () => {
    const administrador = await crearAdministrador();
    const prestador = await crearPrestador();
    const tipoIdentidad = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "IDENTIDAD" } });
    const cedula = await prisma.credencial.create({
      data: { prestadorId: prestador.perfilId, tipoId: tipoIdentidad.id, identificadorDocumento: "11111111-1" },
    });

    expect((await aprobar(administrador.token, "no-existe")).status).toBe(404);
    expect((await aprobar(administrador.token, cedula.id)).status).toBe(404);
  });

  it("un prestador o un cliente reciben 403 en todas las rutas de administración", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearUsuario("CLIENTE");
    const { body } = await subir(prestador.token);
    const id = body.certificacion.id;

    for (const usuario of [prestador, cliente]) {
      expect((await cola(usuario.token)).status).toBe(403);
      expect((await documento(usuario.token, id)).status).toBe(403);
      expect((await aprobar(usuario.token, id)).status).toBe(403);
      expect((await rechazar(usuario.token, id)).status).toBe(403);
    }
    expect((await prisma.credencial.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
    expect(await prisma.accesoDocumento.count()).toBe(0);
  });
});

describe("GET /prestadores/:id/publico", () => {
  it("sin sesión: datos públicos, sello y certificaciones aprobadas, sin documento ni número", async () => {
    const prestador = await crearPrestador();
    await certificacionAprobada(prestador);

    const respuesta = await perfilPublico(prestador.perfilId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.prestador).toMatchObject({
      id: prestador.perfilId,
      nombre: prestador.nombre,
      conCertificaciones: true,
      certificaciones: [
        {
          nombre: "Instalador de gas autorizado (SEC)",
          emisor: "Superintendencia de Electricidad y Combustibles",
          vigenteHasta: `${VIGENTE}T00:00:00.000Z`,
          acreditacion: "REVISADA_POR_LOCALCL",
          verificadaEn: expect.any(String),
        },
      ],
      servicios: [expect.objectContaining({ titulo: "Reparación de calefont", precioDesde: 25000, imagen: null })],
    });
    expect(respuesta.text).not.toContain("SEC-2024-001");
    expect(respuesta.text).not.toContain(prestador.correo);
    expect(respuesta.text).not.toContain(String(prestador.rut));
    expect(respuesta.text).not.toContain("+56912345678");
    expect(respuesta.text).not.toMatch(/"(telefono|correo|rut|identificador|url)"/);
  });

  it("no muestra pendientes, rechazadas, vencidas ni la cédula", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    const { body: pendiente } = await subir(prestador.token, { tipo: "OTRA", identificador: "P-123", nombre: "Pendiente", emisor: "OTEC" });
    const { body: rechazada } = await subir(prestador.token, { tipo: "OTRA", identificador: "R-123", nombre: "Rechazada", emisor: "OTEC" });
    await rechazar(administrador.token, rechazada.certificacion.id);
    const tipoIdentidad = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "IDENTIDAD" } });
    const tipoSec = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo: "SEC_INSTALADOR_GAS" } });
    const verificada = { estado: "VERIFICADA", metodo: "MANUAL", fechaConsulta: new Date(), verificadoPorId: administrador.id } as const;
    await prisma.credencial.createMany({
      data: [
        { prestadorId: prestador.perfilId, tipoId: tipoIdentidad.id, identificadorDocumento: String(prestador.rut), ...verificada },
        { prestadorId: prestador.perfilId, tipoId: tipoSec.id, identificadorDocumento: "V-1", vigenteHasta: new Date("2020-01-01"), ...verificada },
      ],
    });

    const respuesta = await perfilPublico(prestador.perfilId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.prestador).toMatchObject({ conCertificaciones: false, certificaciones: [] });
    expect(pendiente.certificacion.estado).toBe("PENDIENTE");
  });

  it("el mismo 404 para un prestador sin servicios visibles y para un id que no existe", async () => {
    const sinServicios = await crearPrestador({ conServicio: false });

    const oculto = await perfilPublico(sinServicios.perfilId);
    const inexistente = await perfilPublico("no-existe");

    expect(oculto.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(oculto.body).toEqual(inexistente.body);
  });

  it("el buscador y la página del servicio muestran el sello con la misma regla", async () => {
    const prestador = await crearPrestador();
    const servicio = await prisma.servicio.findFirstOrThrow({ where: { prestadorId: prestador.perfilId } });

    const antes = await request(app).get(`/servicios/${servicio.id}`);
    expect(antes.body.servicio.prestador.conCertificaciones).toBe(false);

    await certificacionAprobada(prestador, { tipo: "OTRA", identificador: "INACAP-77", nombre: "Técnico en climatización", emisor: "INACAP" });

    const pagina = await request(app).get(`/servicios/${servicio.id}`);
    expect(pagina.body.servicio.prestador).toMatchObject({
      id: prestador.perfilId,
      conCertificaciones: true,
      certificaciones: [expect.objectContaining({ nombre: "Técnico en climatización", emisor: "INACAP" })],
    });
    expect(pagina.text).not.toContain("INACAP-77");

    const busqueda = await request(app).get("/servicios");
    expect(busqueda.body.resultados).toEqual([
      expect.objectContaining({ id: servicio.id, prestador: expect.objectContaining({ conCertificaciones: true }) }),
    ]);
  });
});

describe("Cursos", () => {
  const CURSO = { tipo: "CURSO", nombre: "Instalaciones eléctricas domiciliarias", emisor: "INACAP", fechaTermino: "2025-03-15", horas: "120" };

  it("si el catálogo todavía no tiene el tipo CURSO, responde 503 con un mensaje de cursos, sin campo", async () => {
    // Lo que pasa en una base donde no se corrió seed:maestros.
    await prisma.tipoCredencial.update({ where: { codigo: "CURSO" }, data: { activo: false } });
    try {
      const prestador = await crearPrestador();

      const respuesta = await subir(prestador.token, CURSO);

      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error.codigo).toBe("CURSOS_NO_DISPONIBLES");
      expect(respuesta.body.error.mensaje).toMatch(/cursos/i);
      expect(respuesta.body.error.mensaje).not.toMatch(/tipo de certificación/i);
      expect(almacenamiento().cantidad).toBe(0);
    } finally {
      await prisma.tipoCredencial.update({ where: { codigo: "CURSO" }, data: { activo: true } });
    }
  });

  it("se sube sin folio ni vigencia: queda PENDIENTE como curso, con fecha de término y horas", async () => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, { ...CURSO, vigenteHasta: "2031-01-01" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.certificacion).toMatchObject({
      clase: "CURSO",
      tipo: "CURSO",
      nombre: "Instalaciones eléctricas domiciliarias",
      emisor: "INACAP",
      identificador: null,
      fechaTermino: "2025-03-15T00:00:00.000Z",
      horas: 120,
      // Un curso no vence: la vigencia se descarta.
      vigenteHasta: null,
      estado: "PENDIENTE",
    });
    expect(almacenamiento().existe(respuesta.body.certificacion.id)).toBe(true);
  });

  it.each([
    ["sin nombre", { ...CURSO, nombre: "" }, "nombre"],
    ["sin institución", { ...CURSO, emisor: "" }, "emisor"],
    ["sin fecha de término", { ...CURSO, fechaTermino: "" }, "fechaTermino"],
    ["con fecha de término futura", { ...CURSO, fechaTermino: "2099-01-01" }, "fechaTermino"],
    ["con horas fuera de rango", { ...CURSO, horas: "0" }, "horas"],
    ["con horas que no son un número", { ...CURSO, horas: "muchas" }, "horas"],
  ])("400 %s", async (_caso, campos, campo) => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, campos);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, campo)).toBeDefined();
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("fecha de término y horas solo se guardan en un curso", async () => {
    const prestador = await crearPrestador();

    const respuesta = await subir(prestador.token, {
      tipo: "SEC_INSTALADOR_GAS",
      identificador: "SEC-2024-001",
      vigenteHasta: VIGENTE,
      fechaTermino: "2025-03-15",
      horas: "40",
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.certificacion).toMatchObject({ clase: "CERTIFICACION", fechaTermino: null, horas: null });
  });

  it("409 si el mismo curso ya está en revisión", async () => {
    const prestador = await crearPrestador();

    expect((await subir(prestador.token, CURSO)).status).toBe(201);
    expect((await subir(prestador.token, { ...CURSO, nombre: "instalaciones ELÉCTRICAS domiciliarias" })).status).toBe(409);
  });

  it("aprobado: aparece en «cursos» del perfil y del servicio, sin folio y sin encender el sello", async () => {
    const prestador = await crearPrestador();
    await certificacionAprobada(prestador, { ...CURSO, identificador: "FOLIO-CURSO-99" });
    const servicio = await prisma.servicio.findFirstOrThrow({ where: { prestadorId: prestador.perfilId } });

    const perfil = await perfilPublico(prestador.perfilId);
    expect(perfil.body.prestador).toMatchObject({
      conCertificaciones: false,
      certificaciones: [],
      cursos: [
        {
          nombre: "Instalaciones eléctricas domiciliarias",
          institucion: "INACAP",
          fechaTermino: "2025-03-15T00:00:00.000Z",
          horas: 120,
          verificadaEn: expect.any(String),
        },
      ],
    });
    expect(perfil.text).not.toContain("FOLIO-CURSO-99");

    const pagina = await request(app).get(`/servicios/${servicio.id}`);
    expect(pagina.body.servicio.prestador).toMatchObject({ conCertificaciones: false, cursos: [expect.objectContaining({ institucion: "INACAP" })] });

    const busqueda = await request(app).get("/servicios");
    expect(busqueda.body.resultados[0].prestador.conCertificaciones).toBe(false);
  });

  it("pendiente o rechazado no se muestra", async () => {
    const prestador = await crearPrestador();
    const administrador = await crearAdministrador();
    await subir(prestador.token, CURSO);
    const { body } = await subir(prestador.token, { ...CURSO, nombre: "Curso de soldadura" });
    await rechazar(administrador.token, body.certificacion.id);

    expect((await perfilPublico(prestador.perfilId)).body.prestador.cursos).toEqual([]);
  });
});
