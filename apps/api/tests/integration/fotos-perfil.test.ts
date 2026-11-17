import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAXIMO_FOTOS_PERFIL_POR_DIA, MAXIMO_REPORTES_POR_DIA } from "@localcl/shared";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { AlmacenamientoPublicoEnMemoria, obtenerAlmacenamientoPerfiles } from "../../src/modules/almacenamiento/index.js";
import { jpgConExif, pdfMinimo, pngConTexto } from "../archivos.js";

/*
  Fotos de perfil: cualquier cuenta sube la suya, se publica al subirla, se
  puede reportar, y el panel muestra SOLO las reportadas, donde un
  administrador la retira (con motivo) o desestima los reportes.
*/

const CONTRASENA = "contrasena-segura-123";
const DIA_MS = 24 * 60 * 60 * 1000;
const MOTIVO = "La foto muestra contenido inapropiado para un perfil público.";

function almacenamiento(): AlmacenamientoPublicoEnMemoria {
  const actual = obtenerAlmacenamientoPerfiles();
  if (!(actual instanceof AlmacenamientoPublicoEnMemoria)) {
    throw new Error("Las pruebas deben usar el almacenamiento público en memoria.");
  }
  return actual;
}

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
  almacenamiento().vaciar();
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);
afterEach(() => {
  vi.restoreAllMocks();
});

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; nombre?: string } = {}) {
  secuencia += 1;
  const correo = `fotos${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: opciones.nombre ?? `Persona${secuencia} Apellido`,
      rol,
      rut: `${40000000 + secuencia}-K`,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

const crearCliente = (opciones: { correoVerificado?: boolean; nombre?: string } = {}) => crearUsuario("CLIENTE", opciones);
const crearAdministrador = () => crearUsuario("ADMINISTRADOR");

/** Prestador con perfil y un servicio publicado (visible). */
async function crearPrestador() {
  const usuario = await crearUsuario("PRESTADOR");
  const perfil = await prisma.perfilPrestador.create({
    data: { usuarioId: usuario.id, comunaId: 13101, descripcion: "Gasfíter con años de oficio.", telefono: "+56912345678" },
  });
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const servicio = await prisma.servicio.create({
    data: {
      prestadorId: perfil.id,
      categoriaId: categoria.id,
      titulo: "Reparación de calefont",
      descripcion: "Mantención y reparación de calefont a domicilio.",
      estado: "PUBLICADO",
    },
  });
  return { ...usuario, perfilId: perfil.id, servicioId: servicio.id };
}

function subirFoto(token: string | null, contenido: Buffer = jpgConExif(), nombre = "selfie.jpg", tipo = "image/jpeg") {
  const solicitud = request(app).put("/cuenta/foto");
  return (token ? solicitud.set("Authorization", `Bearer ${token}`) : solicitud).attach("imagen", contenido, { filename: nombre, contentType: tipo });
}

function miFoto(token: string) {
  return request(app).get("/cuenta/foto").set("Authorization", `Bearer ${token}`);
}

function reportar(token: string, fotoId: string, cuerpo: object = { motivo: "IMAGENES_INAPROPIADAS" }) {
  return request(app).post(`/fotos-perfil/${fotoId}/reportes`).set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function panel(token: string) {
  return request(app).get("/admin/fotos-perfil").set("Authorization", `Bearer ${token}`);
}

function decidir(token: string, fotoId: string, accion: "retirar" | "desestimar", motivo = MOTIVO) {
  return request(app).patch(`/admin/fotos-perfil/${fotoId}/${accion}`).set("Authorization", `Bearer ${token}`).send({ motivo });
}

/** Una cuenta con foto: devuelve la cuenta y el id público de su foto. */
async function conFoto<T extends { token: string }>(cuenta: T) {
  const respuesta = await subirFoto(cuenta.token);
  expect(respuesta.status).toBe(201);
  return { ...cuenta, fotoId: String(respuesta.body.foto.id) };
}

async function fotosDe(usuarioId: string) {
  return prisma.fotoPerfil.findMany({ where: { usuarioId }, orderBy: { creadoEn: "asc" } });
}

describe("PUT /cuenta/foto", () => {
  it.each(["CLIENTE", "PRESTADOR", "ADMINISTRADOR"] as const)("una cuenta %s sube su foto: queda vigente y pública", async (rol) => {
    const cuenta = await crearUsuario(rol);

    const respuesta = await subirFoto(cuenta.token, jpgConExif(), "selfie-en-mi-casa.jpg");

    expect(respuesta.status).toBe(201);
    const [fila] = await fotosDe(cuenta.id);
    expect(fila).toMatchObject({ estado: "VIGENTE", finEn: null });
    expect(respuesta.body.foto).toEqual({
      id: fila?.id,
      url: `https://imagenes.prueba/completa/${fila?.identificador}`,
      miniatura: `https://imagenes.prueba/miniatura/${fila?.identificador}`,
    });
    // El nombre lo genera el servidor; el del archivo no se guarda.
    expect(fila?.identificador).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(fila)).not.toContain("selfie-en-mi-casa");
    expect((await miFoto(cuenta.token)).body).toEqual({ foto: respuesta.body.foto, retirada: null });
  });

  it("le quita los metadatos antes de guardarla: el EXIF con el GPS no llega al proveedor", async () => {
    const cliente = await crearCliente();

    await subirFoto(cliente.token, jpgConExif());

    const [fila] = await fotosDe(cliente.id);
    const guardada = almacenamiento().contenido(String(fila?.identificador));
    expect(guardada?.toString("latin1")).not.toContain("GPS-SECRETO");
    expect(guardada?.toString("latin1")).toContain("DATOS-DE-IMAGEN");
  });

  it.each([
    ["un texto renombrado a .jpg", Buffer.from("<html><script>alert(1)</script></html>"), "foto.jpg", "image/jpeg"],
    ["un PDF", pdfMinimo(), "foto.pdf", "application/pdf"],
    ["un JPEG con la firma pero sin estructura", Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), "foto.jpg", "image/jpeg"],
  ])("rechaza con 400 %s y no guarda nada", async (_caso, contenido, nombre, tipo) => {
    const cliente = await crearCliente();

    const respuesta = await subirFoto(cliente.token, contenido, nombre, tipo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles[0].campo).toBe("imagen");
    expect(almacenamiento().cantidad).toBe(0);
    expect(await fotosDe(cliente.id)).toHaveLength(0);
  });

  it("rechaza con 400 una foto de más de 5 MB", async () => {
    const cliente = await crearCliente();

    const respuesta = await subirFoto(cliente.token, Buffer.concat([jpgConExif(), Buffer.alloc(5 * 1024 * 1024)]));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles[0]).toEqual({ campo: "imagen", mensaje: "La imagen supera los 5 MB." });
  });

  it("sin sesión responde 401 y con el correo sin confirmar, 403", async () => {
    const sinConfirmar = await crearCliente({ correoVerificado: false });

    expect((await subirFoto(null)).status).toBe(401);
    const respuesta = await subirFoto(sinConfirmar.token);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CORREO_NO_VERIFICADO");
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("cambiarla deja una sola vigente y borra el archivo de la anterior", async () => {
    const cliente = await crearCliente();
    await subirFoto(cliente.token, jpgConExif());

    const respuesta = await subirFoto(cliente.token, pngConTexto(), "otra.png", "image/png");

    expect(respuesta.status).toBe(201);
    const [anterior, nueva] = await fotosDe(cliente.id);
    expect(anterior).toMatchObject({ estado: "ELIMINADA" });
    expect(anterior?.finEn).toBeInstanceOf(Date);
    expect(nueva).toMatchObject({ estado: "VIGENTE", id: respuesta.body.foto.id });
    expect(almacenamiento().existe(String(anterior?.identificador))).toBe(false);
    expect(almacenamiento().existe(String(nueva?.identificador))).toBe(true);
  });

  it("si el proveedor no borra la anterior, responde 502 y todo queda como estaba", async () => {
    const cliente = await conFoto(await crearCliente());
    const [original] = await fotosDe(cliente.id);
    vi.spyOn(almacenamiento(), "eliminar").mockRejectedValueOnce(new Error("Cloudinary caído"));

    const respuesta = await subirFoto(cliente.token, pngConTexto(), "otra.png", "image/png");

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error.codigo).toBe("ALMACENAMIENTO_NO_DISPONIBLE");
    expect(JSON.stringify(respuesta.body)).not.toContain("Cloudinary");
    const filas = await fotosDe(cliente.id);
    expect(filas).toEqual([expect.objectContaining({ id: original?.id, estado: "VIGENTE" })]);
    // La nueva no quedó huérfana en el proveedor.
    expect(almacenamiento().cantidad).toBe(1);
  });

  it(`a la subida ${MAXIMO_FOTOS_PERFIL_POR_DIA + 1} en 24 horas responde 429 y no deja el archivo`, async () => {
    const cliente = await crearCliente();
    const identificadores = Array.from({ length: MAXIMO_FOTOS_PERFIL_POR_DIA }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await prisma.fotoPerfil.createMany({
      data: identificadores.map((identificador) => ({ usuarioId: cliente.id, identificador, estado: "ELIMINADA" as const, finEn: new Date() })),
    });

    const respuesta = await subirFoto(cliente.token);

    expect(respuesta.status).toBe(429);
    expect(respuesta.body.error.codigo).toBe("DEMASIADAS_FOTOS");
    expect(almacenamiento().cantidad).toBe(0);
    expect(await fotosDe(cliente.id)).toHaveLength(MAXIMO_FOTOS_PERFIL_POR_DIA);
  });

  it("las subidas de hace más de 24 horas no cuentan para el límite", async () => {
    const cliente = await crearCliente();
    await prisma.fotoPerfil.createMany({
      data: Array.from({ length: MAXIMO_FOTOS_PERFIL_POR_DIA }, (_, i) => ({
        usuarioId: cliente.id,
        identificador: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        estado: "ELIMINADA" as const,
        creadoEn: new Date(Date.now() - 2 * DIA_MS),
        finEn: new Date(Date.now() - 2 * DIA_MS),
      })),
    });

    expect((await subirFoto(cliente.token)).status).toBe(201);
  });
});

describe("DELETE /cuenta/foto", () => {
  it("quita la foto: borra el archivo, la fila queda ELIMINADA y la cuenta sin foto", async () => {
    const cliente = await conFoto(await crearCliente());
    const [fila] = await fotosDe(cliente.id);

    const respuesta = await request(app).delete("/cuenta/foto").set("Authorization", `Bearer ${cliente.token}`);

    expect(respuesta.status).toBe(204);
    expect(almacenamiento().existe(String(fila?.identificador))).toBe(false);
    expect((await fotosDe(cliente.id))[0]).toMatchObject({ estado: "ELIMINADA" });
    expect((await miFoto(cliente.token)).body).toEqual({ foto: null, retirada: null });
    // Idempotente.
    expect((await request(app).delete("/cuenta/foto").set("Authorization", `Bearer ${cliente.token}`)).status).toBe(204);
  });

  it("sin sesión responde 401", async () => {
    expect((await request(app).delete("/cuenta/foto")).status).toBe(401);
    expect((await request(app).get("/cuenta/foto")).status).toBe(401);
  });
});

describe("La foto en las páginas públicas", () => {
  it("la del prestador sale en su perfil público y en la página de su servicio; sin foto, null", async () => {
    const prestador = await crearPrestador();

    expect((await request(app).get(`/prestadores/${prestador.perfilId}/publico`)).body.prestador.foto).toBeNull();
    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).body.servicio.prestador.foto).toBeNull();

    const { foto } = (await subirFoto(prestador.token)).body;
    expect((await request(app).get(`/prestadores/${prestador.perfilId}/publico`)).body.prestador.foto).toEqual(foto);
    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).body.servicio.prestador.foto).toEqual(foto);
  });

  it("la del cliente sale junto a su nombre de pila en sus valoraciones", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente({ nombre: "Camila Andrea Soto" });
    await prisma.contacto.create({
      data: { clienteId: cliente.id, prestadorId: prestador.perfilId, servicioId: prestador.servicioId, canal: "WHATSAPP", creadoEn: new Date(Date.now() - DIA_MS) },
    });
    const valorada = await request(app)
      .post(`/servicios/${prestador.servicioId}/valoraciones`)
      .set("Authorization", `Bearer ${cliente.token}`)
      .send({ calificacion: 5, comentario: "Excelente trabajo, muy puntual." });
    expect(valorada.status).toBe(201);
    const { foto } = (await subirFoto(cliente.token)).body;

    const deServicio = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones`);
    const dePrestador = await request(app).get(`/prestadores/${prestador.perfilId}/valoraciones`);

    expect(deServicio.body.valoraciones[0].cliente).toEqual({ nombre: "Camila", foto });
    expect(dePrestador.body.valoraciones[0].cliente).toEqual({ nombre: "Camila", foto });
    // Solo direcciones y el id para reportarla: nunca el identificador del archivo.
    const [fila] = await fotosDe(cliente.id);
    expect(JSON.stringify(foto)).not.toContain(`"identificador"`);
    expect(foto.id).toBe(fila?.id);
  });

  it("una foto que se quitó deja de salir", async () => {
    const prestador = await conFoto(await crearPrestador());

    await request(app).delete("/cuenta/foto").set("Authorization", `Bearer ${prestador.token}`);

    expect((await request(app).get(`/prestadores/${prestador.perfilId}/publico`)).body.prestador.foto).toBeNull();
  });
});

describe("POST /fotos-perfil/:id/reportes", () => {
  it("cualquier cuenta con sesión reporta la foto de otra: 202, y una segunda vez responde lo mismo sin duplicar", async () => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearPrestador();

    const primera = await reportar(otro.token, dueno.fotoId, { motivo: "SUPLANTACION_DE_IDENTIDAD", comentario: "Es la foto de un actor." });
    const segunda = await reportar(otro.token, dueno.fotoId);

    expect(primera.status).toBe(202);
    expect(segunda.status).toBe(202);
    expect(segunda.body).toEqual(primera.body);
    const denuncias = await prisma.denuncia.findMany({ where: { fotoPerfilId: dueno.fotoId } });
    expect(denuncias).toEqual([expect.objectContaining({ motivo: "SUPLANTACION_DE_IDENTIDAD", detalle: "Es la foto de un actor.", estado: "ABIERTA" })]);
  });

  it("los reportes no retiran la foto por sí solos, por muchos que sean", async () => {
    const dueno = await conFoto(await crearCliente());
    for (let i = 0; i < 5; i += 1) {
      const otro = await crearCliente();
      expect((await reportar(otro.token, dueno.fotoId)).status).toBe(202);
    }

    expect((await miFoto(dueno.token)).body.foto).not.toBeNull();
  });

  it("nadie reporta su propia foto (403)", async () => {
    const dueno = await conFoto(await crearCliente());

    const respuesta = await reportar(dueno.token, dueno.fotoId);

    expect(respuesta.status).toBe(403);
    expect(await prisma.denuncia.count()).toBe(0);
  });

  it("una foto que no existe o que ya no se muestra responde 404", async () => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearCliente();
    await request(app).delete("/cuenta/foto").set("Authorization", `Bearer ${dueno.token}`);

    expect((await reportar(otro.token, dueno.fotoId)).status).toBe(404);
    expect((await reportar(otro.token, "no-existe")).status).toBe(404);
  });

  it.each([
    ["un motivo de servicio", { motivo: "CONTENIDO_ENGANOSO" }, "motivo"],
    ["un motivo de valoración", { motivo: "LENGUAJE_OFENSIVO" }, "motivo"],
    ["OTRO sin comentario", { motivo: "OTRO" }, "comentario"],
  ])("rechaza con 400 %s", async (_caso, cuerpo, campo) => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearCliente();

    const respuesta = await reportar(otro.token, dueno.fotoId, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles[0].campo).toBe(campo);
  });

  it("sin el correo confirmado responde 403; sin sesión, 401", async () => {
    const dueno = await conFoto(await crearCliente());
    const sinConfirmar = await crearCliente({ correoVerificado: false });

    expect((await reportar(sinConfirmar.token, dueno.fotoId)).status).toBe(403);
    expect((await request(app).post(`/fotos-perfil/${dueno.fotoId}/reportes`).send({ motivo: "OTRO" })).status).toBe(401);
  });

  it("el límite diario de reportes es uno solo, contando servicios y fotos", async () => {
    const otro = await crearCliente();
    const prestadores = await Promise.all(Array.from({ length: MAXIMO_REPORTES_POR_DIA }, () => crearPrestador()));
    for (const prestador of prestadores) {
      const respuesta = await request(app)
        .post(`/servicios/${prestador.servicioId}/reportes`)
        .set("Authorization", `Bearer ${otro.token}`)
        .send({ motivo: "CONTENIDO_ENGANOSO" });
      expect(respuesta.status).toBe(202);
    }
    const dueno = await conFoto(await crearCliente());

    const respuesta = await reportar(otro.token, dueno.fotoId);

    expect(respuesta.status).toBe(429);
    expect(await prisma.denuncia.count({ where: { fotoPerfilId: dueno.fotoId } })).toBe(0);
  });

  it("si su dueño la cambia, los reportes abiertos de la anterior se cierran (no queda nada que decidir)", async () => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearCliente();
    await reportar(otro.token, dueno.fotoId);

    await subirFoto(dueno.token, pngConTexto(), "otra.png", "image/png");

    expect(await prisma.denuncia.findFirst({ where: { fotoPerfilId: dueno.fotoId } })).toMatchObject({ estado: "RETIRADA", resolucion: null });
  });
});

describe("Panel: /admin/fotos-perfil", () => {
  it("muestra SOLO las fotos reportadas, con los reportes y sin decir quién reportó", async () => {
    const administrador = await crearAdministrador();
    const reportada = await conFoto(await crearCliente({ nombre: "Rodrigo Pérez" }));
    await conFoto(await crearCliente());
    await conFoto(await crearPrestador());
    const denunciante = await crearCliente({ nombre: "Denunciante Secreto" });
    await reportar(denunciante.token, reportada.fotoId, { motivo: "OTRO", comentario: "La foto tiene un número de teléfono." });

    const respuesta = await panel(administrador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.fotos).toHaveLength(1);
    expect(respuesta.body.fotos[0]).toMatchObject({
      id: reportada.fotoId,
      cuenta: { nombre: "Rodrigo Pérez", rol: "CLIENTE" },
      personas: 1,
      retiradasAntes: 0,
      reportes: [expect.objectContaining({ motivo: "OTRO", comentario: "La foto tiene un número de teléfono.", cuentaConMasDeUnaSemana: false })],
    });
    expect(respuesta.body.fotos[0].url).toMatch(/^https:\/\/imagenes\.prueba\//);
    const cuerpo = JSON.stringify(respuesta.body);
    expect(cuerpo).not.toContain(denunciante.id);
    expect(cuerpo).not.toContain("Denunciante Secreto");
    expect(cuerpo).not.toContain(denunciante.correo);
  });

  it("sin reportes, el panel no muestra ninguna foto", async () => {
    const administrador = await crearAdministrador();
    await conFoto(await crearCliente());

    expect((await panel(administrador.token)).body).toMatchObject({ fotos: [], total: 0 });
  });

  it.each(["CLIENTE", "PRESTADOR"] as const)("una cuenta %s recibe 403 en el panel y en las decisiones", async (rol) => {
    const cuenta = await crearUsuario(rol);
    const dueno = await conFoto(await crearCliente());

    expect((await panel(cuenta.token)).status).toBe(403);
    expect((await decidir(cuenta.token, dueno.fotoId, "retirar")).status).toBe(403);
    expect((await miFoto(dueno.token)).body.foto).not.toBeNull();
  });

  it("retirar: borra el archivo, cierra los reportes, deja la decisión en la bitácora y el dueño ve el motivo", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearPrestador());
    const [fila] = await fotosDe(dueno.id);
    await reportar((await crearCliente()).token, dueno.fotoId);
    await reportar((await crearCliente()).token, dueno.fotoId);

    const respuesta = await decidir(administrador.token, dueno.fotoId, "retirar");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ foto: { id: dueno.fotoId, estado: "RETIRADA" }, accion: "RETIRAR_FOTO_PERFIL" });
    expect(almacenamiento().existe(String(fila?.identificador))).toBe(false);
    expect((await fotosDe(dueno.id))[0]).toMatchObject({ estado: "RETIRADA" });
    const denuncias = await prisma.denuncia.findMany({ where: { fotoPerfilId: dueno.fotoId } });
    expect(denuncias.every((denuncia) => denuncia.estado === "RESUELTA" && denuncia.resueltaPorId === administrador.id)).toBe(true);
    expect(await prisma.decisionReporte.findMany({ where: { fotoPerfilId: dueno.fotoId } })).toEqual([
      expect.objectContaining({ accion: "RETIRAR_FOTO_PERFIL", motivo: MOTIVO, reportesCerrados: 2, administradorId: administrador.id }),
    ]);
    // El dueño ve el aviso con el motivo; el público ya no ve la foto; el panel ya no la muestra.
    const propia = await miFoto(dueno.token);
    expect(propia.body).toMatchObject({ foto: null, retirada: { motivo: MOTIVO } });
    expect((await request(app).get(`/prestadores/${dueno.perfilId}/publico`)).body.prestador.foto).toBeNull();
    expect((await panel(administrador.token)).body.total).toBe(0);
  });

  it("tras un retiro, el dueño puede subir otra: el aviso desaparece y el panel cuenta el retiro anterior", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearCliente());
    await reportar((await crearCliente()).token, dueno.fotoId);
    await decidir(administrador.token, dueno.fotoId, "retirar");

    const nueva = await conFoto(dueno);
    await reportar((await crearCliente()).token, nueva.fotoId);

    expect((await miFoto(dueno.token)).body).toMatchObject({ foto: { id: nueva.fotoId }, retirada: null });
    expect((await panel(administrador.token)).body.fotos[0]).toMatchObject({ id: nueva.fotoId, retiradasAntes: 1 });
  });

  it("desestimar: la foto sigue, los reportes quedan desestimados y sale del panel", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearCliente());
    await reportar((await crearCliente()).token, dueno.fotoId);

    const respuesta = await decidir(administrador.token, dueno.fotoId, "desestimar", "Es una foto normal de la persona.");

    expect(respuesta.status).toBe(200);
    expect((await miFoto(dueno.token)).body.foto).toMatchObject({ id: dueno.fotoId });
    expect(await prisma.denuncia.findFirst({ where: { fotoPerfilId: dueno.fotoId } })).toMatchObject({ estado: "DESESTIMADA" });
    expect((await panel(administrador.token)).body.total).toBe(0);
    // Sin reportes pendientes no hay nada que desestimar.
    expect((await decidir(administrador.token, dueno.fotoId, "desestimar")).status).toBe(409);
  });

  it("no se retira dos veces ni una foto que su dueño ya cambió (409); una que no existe, 404", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearCliente());
    await reportar((await crearCliente()).token, dueno.fotoId);
    await decidir(administrador.token, dueno.fotoId, "retirar");

    expect((await decidir(administrador.token, dueno.fotoId, "retirar")).status).toBe(409);
    const otro = await conFoto(await crearCliente());
    await subirFoto(otro.token, pngConTexto(), "otra.png", "image/png");
    expect((await decidir(administrador.token, otro.fotoId, "retirar")).status).toBe(409);
    expect((await decidir(administrador.token, "no-existe", "retirar")).status).toBe(404);
  });

  it("el motivo es obligatorio: uno muy corto responde 400 y no decide nada", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearCliente());
    await reportar((await crearCliente()).token, dueno.fotoId);

    const respuesta = await decidir(administrador.token, dueno.fotoId, "retirar", "corto");

    expect(respuesta.status).toBe(400);
    expect((await miFoto(dueno.token)).body.foto).not.toBeNull();
    expect(await prisma.decisionReporte.count()).toBe(0);
  });

  it("si el proveedor no borra el archivo, responde 502 y no se retira nada", async () => {
    const administrador = await crearAdministrador();
    const dueno = await conFoto(await crearCliente());
    await reportar((await crearCliente()).token, dueno.fotoId);
    vi.spyOn(almacenamiento(), "eliminar").mockRejectedValueOnce(new Error("Cloudinary caído"));

    const respuesta = await decidir(administrador.token, dueno.fotoId, "retirar");

    expect(respuesta.status).toBe(502);
    expect((await fotosDe(dueno.id))[0]).toMatchObject({ estado: "VIGENTE" });
    expect(await prisma.denuncia.findFirst({ where: { fotoPerfilId: dueno.fotoId } })).toMatchObject({ estado: "ABIERTA" });
    expect(await prisma.decisionReporte.count()).toBe(0);
  });
});

describe("Reglas en la base", () => {
  it("una cuenta no puede tener dos fotos vigentes", async () => {
    const cliente = await conFoto(await crearCliente());

    await expect(
      prisma.fotoPerfil.create({ data: { usuarioId: cliente.id, identificador: "00000000-0000-4000-8000-000000000099" } }),
    ).rejects.toThrow();
  });

  it("una foto vigente no tiene fecha de fin, y una que no lo es sí", async () => {
    const cliente = await crearCliente();

    await expect(
      prisma.fotoPerfil.create({ data: { usuarioId: cliente.id, identificador: "00000000-0000-4000-8000-000000000001", finEn: new Date() } }),
    ).rejects.toThrow(/fotos_perfil_fin_segun_estado/);
    await expect(
      prisma.fotoPerfil.create({ data: { usuarioId: cliente.id, identificador: "00000000-0000-4000-8000-000000000002", estado: "RETIRADA" } }),
    ).rejects.toThrow(/fotos_perfil_fin_segun_estado/);
  });

  it("un reporte de foto solo admite los motivos de una foto", async () => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearCliente();

    await expect(
      prisma.denuncia.create({ data: { denuncianteId: otro.id, fotoPerfilId: dueno.fotoId, motivo: "LENGUAJE_OFENSIVO" } }),
    ).rejects.toThrow(/denuncias_motivo_segun_objeto/);
  });

  it("un reporte apunta a exactamente un objeto", async () => {
    const dueno = await conFoto(await crearPrestador());
    const otro = await crearCliente();

    await expect(
      prisma.denuncia.create({
        data: { denuncianteId: otro.id, fotoPerfilId: dueno.fotoId, servicioId: dueno.servicioId, motivo: "IMAGENES_INAPROPIADAS" },
      }),
    ).rejects.toThrow(/denuncias_exactamente_un_objeto/);
  });

  it("una decisión de retirar una foto debe nombrar la foto", async () => {
    const administrador = await crearAdministrador();
    const prestador = await crearPrestador();

    await expect(
      prisma.decisionReporte.create({
        data: { servicioId: prestador.servicioId, accion: "RETIRAR_FOTO_PERFIL", motivo: MOTIVO, reportesCerrados: 0, administradorId: administrador.id },
      }),
    ).rejects.toThrow(/decisiones_reporte_accion_segun_objeto/);
  });

  it("una sola denuncia abierta por persona y foto", async () => {
    const dueno = await conFoto(await crearCliente());
    const otro = await crearCliente();
    await prisma.denuncia.create({ data: { denuncianteId: otro.id, fotoPerfilId: dueno.fotoId, motivo: "IMAGENES_INAPROPIADAS" } });

    await expect(
      prisma.denuncia.create({ data: { denuncianteId: otro.id, fotoPerfilId: dueno.fotoId, motivo: "OTRO", detalle: "De nuevo, la misma foto." } }),
    ).rejects.toThrow();
  });
});
