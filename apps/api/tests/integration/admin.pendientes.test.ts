import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { TERMINOS_ACEPTADOS } from "../terminos.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

/*
  El panel de administración organizado por prestador: GET /admin/pendientes
  dice quién tiene algo por revisar y cuánto de cada tipo, y cada cola acepta
  ?prestador= para mostrar solo lo de uno.
*/

const CONTRASENA = "contrasena-segura-123";
const HORA = 60 * 60 * 1000;

async function vaciar() {
  // TRUNCATE: las bitácoras rechazan DELETE.
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});
beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, nombre?: string) {
  secuencia += 1;
  const correo = `pendientes${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      ...TERMINOS_ACEPTADOS,
      correo,
      nombre: nombre ?? `Persona ${secuencia}`,
      rol,
      rut: rol === "PRESTADOR" ? `${40000000 + secuencia}-K` : null,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

/** Prestador con perfil y un servicio publicado. */
async function crearPrestador(nombre: string) {
  const usuario = await crearUsuario("PRESTADOR", nombre);
  const perfil = await prisma.perfilPrestador.create({
    data: { usuarioId: usuario.id, comunaId: 13101, descripcion: "Prestador de la zona.", telefono: "+56912345678" },
  });
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const servicio = await prisma.servicio.create({
    data: { prestadorId: perfil.id, categoriaId: categoria.id, titulo: `Servicio de ${nombre}`, descripcion: "Trabajos garantizados.", estado: "PUBLICADO" },
  });
  return { ...usuario, perfilId: perfil.id, servicioId: servicio.id };
}

type Prestador = Awaited<ReturnType<typeof crearPrestador>>;

async function credencialPendiente(prestador: Prestador, codigo: "IDENTIDAD" | "SEC_INSTALADOR_GAS" | "CURSO", haceHoras = 1) {
  const tipo = await prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo } });
  return prisma.credencial.create({
    data: {
      prestadorId: prestador.perfilId,
      tipoId: tipo.id,
      identificadorDocumento: `DOC-${codigo}-${prestador.perfilId.slice(0, 6)}`,
      ...(codigo === "CURSO"
        ? { nombrePersonalizado: "Curso de soldadura", emisorPersonalizado: "OTEC Capacita", fechaTermino: new Date("2024-08-30") }
        : {}),
      creadoEn: new Date(Date.now() - haceHoras * HORA),
    },
  });
}

/** Un reporte de una persona nueva sobre el servicio del prestador. */
async function reportar(prestador: Prestador, haceHoras = 1) {
  const denunciante = await crearUsuario("CLIENTE");
  return prisma.denuncia.create({
    data: { denuncianteId: denunciante.id, servicioId: prestador.servicioId, motivo: "CONTENIDO_ENGANOSO", creadoEn: new Date(Date.now() - haceHoras * HORA) },
  });
}

/** Una valoración del servicio, objetada por su prestador. */
async function objecion(prestador: Prestador) {
  const cliente = await crearUsuario("CLIENTE");
  const contacto = await prisma.contacto.create({
    data: { clienteId: cliente.id, prestadorId: prestador.perfilId, servicioId: prestador.servicioId, canal: "WHATSAPP" },
  });
  const valoracion = await prisma.valoracion.create({
    data: { contactoId: contacto.id, clienteId: cliente.id, prestadorId: prestador.perfilId, servicioId: prestador.servicioId, calificacion: 1 },
  });
  await prisma.denuncia.create({ data: { denuncianteId: prestador.id, valoracionId: valoracion.id, motivo: "LENGUAJE_OFENSIVO" } });
  return valoracion;
}

let imagenes = 0;
async function imagen(prestador: Prestador, haceHoras = 1) {
  imagenes += 1;
  return prisma.imagenServicio.create({
    data: { servicioId: prestador.servicioId, identificador: `archivo-${imagenes}`, orden: imagenes, creadoEn: new Date(Date.now() - haceHoras * HORA) },
  });
}

function pendientes(token: string | null, consulta = "") {
  const solicitud = request(app).get(`/admin/pendientes${consulta}`);
  return token ? solicitud.set("Authorization", `Bearer ${token}`) : solicitud;
}

const conToken = (token: string, ruta: string) => request(app).get(ruta).set("Authorization", `Bearer ${token}`);

interface Fila {
  id: string;
  nombre: string;
  pendientes: { identidad: number; certificaciones: number; cursos: number; reportes: number; imagenes: number };
  total: number;
}

describe("GET /admin/pendientes", () => {
  it("solo un administrador: sin sesión 401; cliente y prestador 403", async () => {
    const prestador = await crearPrestador("Pedro Soto");
    const cliente = await crearUsuario("CLIENTE");

    expect((await pendientes(null)).status).toBe(401);
    expect((await pendientes(cliente.token)).status).toBe(403);
    expect((await pendientes(prestador.token)).status).toBe(403);
  });

  it("lista solo a los prestadores con algo por revisar, con el conteo de cada tipo", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const carolina = await crearPrestador("Carolina Muñoz");
    await crearPrestador("Sin Pendientes");
    await credencialPendiente(pedro, "IDENTIDAD");
    await credencialPendiente(pedro, "SEC_INSTALADOR_GAS");
    await credencialPendiente(pedro, "CURSO");
    await imagen(pedro);
    await imagen(pedro);
    await reportar(carolina);

    const respuesta = await pendientes(admin.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["cache-control"]).toBe("no-store");
    expect(respuesta.body.total).toBe(2);
    const filas = respuesta.body.prestadores as Fila[];
    expect(filas.map((fila) => fila.nombre).sort()).toEqual(["Carolina Muñoz", "Pedro Soto"]);
    expect(filas.find((fila) => fila.id === pedro.perfilId)).toMatchObject({
      pendientes: { identidad: 1, certificaciones: 1, cursos: 1, reportes: 0, imagenes: 2 },
      total: 5,
    });
    expect(filas.find((fila) => fila.id === carolina.perfilId)).toMatchObject({
      pendientes: { identidad: 0, certificaciones: 0, cursos: 0, reportes: 1, imagenes: 0 },
      total: 1,
    });
  });

  it("reportes: un servicio reportado por tres personas cuenta una vez; una valoración objetada, otra", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    await reportar(pedro);
    await reportar(pedro);
    await reportar(pedro);
    await objecion(pedro);

    const [fila] = (await pendientes(admin.token)).body.prestadores as Fila[];

    expect(fila?.pendientes.reportes).toBe(2);
    // El mismo número que muestra la cola al desplegar al prestador.
    const cola = await conToken(admin.token, `/admin/reportes?prestador=${pedro.perfilId}`);
    expect(cola.body.total).toBe(2);
  });

  it("lo ya decidido no cuenta: credenciales resueltas, reportes cerrados e imágenes ocultas o revisadas", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const identidad = await credencialPendiente(pedro, "IDENTIDAD");
    const reporte = await reportar(pedro);
    const oculta = await imagen(pedro);
    const revisada = await imagen(pedro);
    expect(((await pendientes(admin.token)).body.prestadores as Fila[])[0]?.total).toBe(4);

    await prisma.credencial.update({ where: { id: identidad.id }, data: { estado: "RECHAZADA", motivoRechazo: "La foto está borrosa." } });
    await prisma.denuncia.update({ where: { id: reporte.id }, data: { estado: "DESESTIMADA", resueltaEn: new Date(), resueltaPorId: admin.id, resolucion: "Sin mérito suficiente." } });
    await prisma.imagenServicio.update({ where: { id: oculta.id }, data: { estado: "OCULTA" } });
    await prisma.imagenServicio.update({ where: { id: revisada.id }, data: { revisadaEn: new Date(), revisadaPorId: admin.id } });

    const respuesta = await pendientes(admin.token);

    expect(respuesta.body.prestadores).toEqual([]);
    expect(respuesta.body.total).toBe(0);
  });

  it("primero quien lleva más tiempo esperando; la paginación no repite ni salta", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena"];
    for (const [indice, nombre] of nombres.entries()) {
      // Elena es la que más espera; Ana, la que menos.
      await credencialPendiente(await crearPrestador(nombre), "IDENTIDAD", (indice + 1) * 10);
    }

    const completa = await pendientes(admin.token);
    const paginas: string[] = [];
    for (const pagina of [1, 2, 3]) {
      const respuesta = await pendientes(admin.token, `?pagina=${pagina}&porPagina=2`);
      expect(respuesta.body.total).toBe(5);
      paginas.push(...(respuesta.body.prestadores as Fila[]).map((fila) => fila.nombre));
    }

    expect((completa.body.prestadores as Fila[]).map((fila) => fila.nombre)).toEqual(["Elena", "Diego", "Clara", "Bruno", "Ana"]);
    expect(paginas).toEqual(["Elena", "Diego", "Clara", "Bruno", "Ana"]);
  });

  it("del prestador entrega el nombre y nada más: ni RUT, ni correo, ni teléfono", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    await credencialPendiente(pedro, "IDENTIDAD");

    const respuesta = await pendientes(admin.token);

    expect(respuesta.text).not.toContain(String(pedro.rut));
    expect(respuesta.text).not.toContain(pedro.correo);
    expect(respuesta.text).not.toContain("+569");
    expect(Object.keys(respuesta.body.prestadores[0]).sort()).toEqual(["esperandoDesde", "id", "nombre", "pendientes", "total"]);
  });

  it("rechaza una página mal formada con 400", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    expect((await pendientes(admin.token, "?pagina=0")).status).toBe(400);
    expect((await pendientes(admin.token, "?porPagina=500")).status).toBe(400);
  });
});

describe("Las colas filtradas por prestador", () => {
  it("?prestador= deja solo lo de ese prestador en identidades, certificaciones, reportes e imágenes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const carolina = await crearPrestador("Carolina Muñoz");
    for (const prestador of [pedro, carolina]) {
      await credencialPendiente(prestador, "IDENTIDAD");
      await credencialPendiente(prestador, "SEC_INSTALADOR_GAS");
      await reportar(prestador);
      await imagen(prestador);
    }
    const filtro = `prestador=${pedro.perfilId}`;

    const identidades = await conToken(admin.token, `/admin/identidades?${filtro}`);
    const certificaciones = await conToken(admin.token, `/admin/certificaciones?${filtro}`);
    const reportes = await conToken(admin.token, `/admin/reportes?${filtro}`);
    const fotos = await conToken(admin.token, `/admin/imagenes?${filtro}&sinRevisar=true`);

    expect(identidades.body.total).toBe(1);
    expect(identidades.body.identidades[0].prestador).toMatchObject({ id: pedro.perfilId, nombre: "Pedro Soto" });
    expect(certificaciones.body.total).toBe(1);
    expect(certificaciones.body.certificaciones[0].prestador.id).toBe(pedro.perfilId);
    expect(reportes.body.total).toBe(1);
    expect(reportes.body.casos[0].servicio.prestador).toBe("Pedro Soto");
    expect(fotos.body.total).toBe(1);
    expect(fotos.body.imagenes[0].servicio.prestador).toBe("Pedro Soto");

    // Sin el filtro siguen saliendo los dos.
    expect((await conToken(admin.token, "/admin/identidades")).body.total).toBe(2);
    expect((await conToken(admin.token, "/admin/reportes")).body.total).toBe(2);
  });

  it("un prestador que no existe no trae nada (no es un error)", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    await credencialPendiente(await crearPrestador("Pedro Soto"), "IDENTIDAD");

    const respuesta = await conToken(admin.token, "/admin/identidades?prestador=no-existe");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(0);
  });

  it("el filtro no puede inyectar SQL en la cola de reportes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    await reportar(await crearPrestador("Pedro Soto"));

    const respuesta = await conToken(admin.token, `/admin/reportes?prestador=${encodeURIComponent("x' OR '1'='1")}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(0);
    expect(await prisma.denuncia.count()).toBe(1);
  });
});

describe("Imágenes por revisar", () => {
  function marcar(token: string, ids: string[]) {
    return request(app).patch("/admin/imagenes/revisadas").set("Authorization", `Bearer ${token}`).send({ ids });
  }

  it("una foto recién subida queda por revisar; sinRevisar=true deja fuera las revisadas y las ocultas", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const nueva = await imagen(pedro);
    const revisada = await imagen(pedro);
    const oculta = await imagen(pedro);
    await prisma.imagenServicio.update({ where: { id: revisada.id }, data: { revisadaEn: new Date(), revisadaPorId: admin.id } });
    await prisma.imagenServicio.update({ where: { id: oculta.id }, data: { estado: "OCULTA" } });

    const sinRevisar = await conToken(admin.token, "/admin/imagenes?sinRevisar=true");
    const todas = await conToken(admin.token, "/admin/imagenes");

    expect(sinRevisar.body.imagenes.map((fila: { id: string }) => fila.id)).toEqual([nueva.id]);
    expect(sinRevisar.body.imagenes[0].porRevisar).toBe(true);
    expect(todas.body.total).toBe(3);
    const porId = new Map((todas.body.imagenes as { id: string; porRevisar: boolean }[]).map((fila) => [fila.id, fila.porRevisar]));
    expect(porId.get(revisada.id)).toBe(false);
    expect(porId.get(oculta.id)).toBe(false);
  });

  it("marcar como revisadas: guarda quién y cuándo, y el prestador deja de figurar con pendientes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const una = await imagen(pedro);
    const otra = await imagen(pedro);

    const respuesta = await marcar(admin.token, [una.id, otra.id]);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ revisadas: 2 });
    const guardada = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: una.id } });
    expect(guardada.revisadaPorId).toBe(admin.id);
    expect(guardada.revisadaEn).toBeInstanceOf(Date);
    // Sigue visible para el público: revisar no cambia lo que se publica.
    expect(guardada.estado).toBe("VISIBLE");
    expect((await pendientes(admin.token)).body.prestadores).toEqual([]);
  });

  it("solo marca las que se indicaron: una foto subida mientras revisaba sigue pendiente", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const vista = await imagen(pedro);
    const subidaDespues = await imagen(pedro);

    await marcar(admin.token, [vista.id]);

    const [fila] = (await pendientes(admin.token)).body.prestadores as Fila[];
    expect(fila?.pendientes.imagenes).toBe(1);
    expect((await prisma.imagenServicio.findUniqueOrThrow({ where: { id: subidaDespues.id } })).revisadaEn).toBeNull();
  });

  it("repetir la marca no cambia nada: 0 revisadas, y se conserva la primera revisión", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const otroAdmin = await crearUsuario("ADMINISTRADOR");
    const foto = await imagen(await crearPrestador("Pedro Soto"));
    await marcar(admin.token, [foto.id]);
    const primera = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: foto.id } });

    const repetida = await marcar(otroAdmin.token, [foto.id, "no-existe"]);

    expect(repetida.body).toEqual({ revisadas: 0 });
    expect(await prisma.imagenServicio.findUniqueOrThrow({ where: { id: foto.id } })).toMatchObject({
      revisadaPorId: admin.id,
      revisadaEn: primera.revisadaEn,
    });
  });

  it("ocultar una foto también la saca de los pendientes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const foto = await imagen(pedro);

    const respuesta = await request(app)
      .patch(`/admin/imagenes/${foto.id}/ocultar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ motivo: "Muestra la dirección de un cliente." });

    expect(respuesta.status).toBe(200);
    expect((await pendientes(admin.token)).body.prestadores).toEqual([]);
  });

  it("solo un administrador marca: el prestador dueño recibe 403 y nada cambia; sin ids, 400", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const pedro = await crearPrestador("Pedro Soto");
    const foto = await imagen(pedro);

    expect((await marcar(pedro.token, [foto.id])).status).toBe(403);
    expect((await request(app).patch("/admin/imagenes/revisadas").send({ ids: [foto.id] })).status).toBe(401);
    expect((await marcar(admin.token, [])).status).toBe(400);
    expect((await prisma.imagenServicio.findUniqueOrThrow({ where: { id: foto.id } })).revisadaEn).toBeNull();
  });

  it("la base exige fecha y autor juntos", async () => {
    const foto = await imagen(await crearPrestador("Pedro Soto"));

    await expect(prisma.imagenServicio.update({ where: { id: foto.id }, data: { revisadaEn: new Date() } })).rejects.toThrow(
      "imagenes_servicio_revision_completa",
    );
  });
});
