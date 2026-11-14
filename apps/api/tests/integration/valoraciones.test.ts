import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const CONTRASENA = "contrasena-segura-123";
const DIA_MS = 24 * 60 * 60 * 1000;

async function vaciar() {
  // TRUNCATE: la bitácora de decisiones rechaza DELETE.
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean; nombre?: string } = {}) {
  secuencia += 1;
  const correo = `valoraciones${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: opciones.nombre ?? `Persona${secuencia} Apellido Segundo`,
      rol,
      rut: `${20000000 + secuencia}-K`,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

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

const crearCliente = (opciones: { correoVerificado?: boolean; nombre?: string } = {}) => crearUsuario("CLIENTE", opciones);
const crearAdministrador = () => crearUsuario("ADMINISTRADOR");

/** Un contacto registrado POR UN SERVICIO, hace `diasAtras` días. */
async function contactar(clienteId: string, servicio: { perfilId: string; servicioId: string }, diasAtras = 1) {
  return prisma.contacto.create({
    data: {
      clienteId,
      prestadorId: servicio.perfilId,
      servicioId: servicio.servicioId,
      canal: "WHATSAPP",
      creadoEn: new Date(Date.now() - diasAtras * DIA_MS),
    },
  });
}

function valorar(token: string | null, servicioId: string, cuerpo: object = { calificacion: 5, comentario: "Excelente trabajo, muy puntual." }) {
  const solicitud = request(app).post(`/servicios/${servicioId}/valoraciones`);
  return token ? solicitud.set("Authorization", `Bearer ${token}`).send(cuerpo) : solicitud.send(cuerpo);
}

/** Todas las del prestador (su perfil), con el promedio general. */
function lista(prestadorId: string, consulta = "") {
  return request(app).get(`/prestadores/${prestadorId}/valoraciones${consulta}`);
}

/** Las de un servicio (su página). */
function listaServicio(servicioId: string, consulta = "") {
  return request(app).get(`/servicios/${servicioId}/valoraciones${consulta}`);
}

/** Otro servicio publicado del mismo prestador. */
async function otroServicio(prestador: { perfilId: string }, titulo = "Destape de cañerías") {
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const servicio = await prisma.servicio.create({
    data: { prestadorId: prestador.perfilId, categoriaId: categoria.id, titulo, descripcion: "Destapes con máquina, el mismo día.", estado: "PUBLICADO" },
  });
  return { perfilId: prestador.perfilId, servicioId: servicio.id };
}

function objetar(token: string, valoracionId: string, cuerpo: object = { motivo: "LENGUAJE_OFENSIVO" }) {
  return request(app).post(`/valoraciones/${valoracionId}/objecion`).set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function cola(token: string, estado = "pendientes") {
  return request(app).get(`/admin/reportes?estado=${estado}`).set("Authorization", `Bearer ${token}`);
}

function decidir(token: string, valoracionId: string, accion: "desestimar" | "ocultar", motivo = "Revisado el texto contra las normas.") {
  return request(app)
    .patch(`/admin/reportes/valoraciones/${valoracionId}/${accion}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ motivo });
}

/** Un cliente con contacto valora el servicio; devuelve el id de la valoración. */
async function valoracionDe(prestador: { perfilId: string; servicioId: string }, calificacion: number, comentario: string | null = null) {
  const cliente = await crearCliente();
  await contactar(cliente.id, prestador);
  const respuesta = await valorar(cliente.token, prestador.servicioId, { calificacion, comentario });
  expect(respuesta.status).toBe(201);
  return { cliente, id: String(respuesta.body.valoracion.id) };
}

function detalleDe(cuerpo: { error?: { detalles?: { campo: string }[] } }, campo: string) {
  return cuerpo.error?.detalles?.find((detalle) => detalle.campo === campo);
}

describe("POST /servicios/:id/valoraciones", () => {
  it("un cliente con contacto y correo verificado valora: se crea PUBLICADA y enlazada al contacto", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    const contacto = await contactar(cliente.id, prestador);

    const respuesta = await valorar(cliente.token, prestador.servicioId);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.valoracion).toMatchObject({ calificacion: 5, estado: "PUBLICADA", editada: false, editadaEn: null });
    const guardada = await prisma.valoracion.findUniqueOrThrow({ where: { id: respuesta.body.valoracion.id } });
    expect(guardada).toMatchObject({ contactoId: contacto.id, clienteId: cliente.id, prestadorId: prestador.perfilId });
  });

  it("el estado lo fija el servidor: un «estado» en el cuerpo se ignora", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);

    const respuesta = await valorar(cliente.token, prestador.servicioId, { calificacion: 4, estado: "OCULTA" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.valoracion.estado).toBe("PUBLICADA");
  });

  it("sin contacto registrado: 403 SIN_CONTACTO", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();

    const respuesta = await valorar(cliente.token, prestador.servicioId);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_CONTACTO");
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("sin correo verificado: 403; sin sesión: 401", async () => {
    const prestador = await crearPrestador();
    const sinCorreo = await crearCliente({ correoVerificado: false });
    await contactar(sinCorreo.id, prestador);

    expect((await valorar(sinCorreo.token, prestador.servicioId)).status).toBe(403);
    expect((await valorar(null, prestador.servicioId)).status).toBe(401);
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("es definitiva: valorar dos veces responde 409 VALORACION_YA_EXISTE y la primera queda intacta", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);
    await valorar(cliente.token, prestador.servicioId, { calificacion: 2, comentario: "Llegó tarde y no avisó nada." });

    const respuesta = await valorar(cliente.token, prestador.servicioId, { calificacion: 4, comentario: "Volvió y lo dejó funcionando." });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("VALORACION_YA_EXISTE");
    const guardada = await prisma.valoracion.findFirstOrThrow();
    expect(guardada).toMatchObject({ calificacion: 2, comentario: "Llegó tarde y no avisó nada.", editadaEn: null });
    expect(await prisma.valoracion.count()).toBe(1);
  });

  it("quien ya valoró recibe 409 aunque su plazo haya vencido: no se le dice «plazo vencido»", async () => {
    const prestador = await crearPrestador();
    const { cliente } = await valoracionDe(prestador, 3);
    await prisma.contacto.updateMany({ data: { creadoEn: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } });

    const respuesta = await valorar(cliente.token, prestador.servicioId, { calificacion: 5 });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("VALORACION_YA_EXISTE");
  });

  it.each([
    ["calificación 0", { calificacion: 0 }, "calificacion"],
    ["calificación 6", { calificacion: 6 }, "calificacion"],
    ["calificación con decimales", { calificacion: 4.5 }, "calificacion"],
    ["sin calificación", { comentario: "Muy buen servicio en general." }, "calificacion"],
    ["comentario de 9 caracteres", { calificacion: 4, comentario: "123456789" }, "comentario"],
    ["comentario de 1001 caracteres", { calificacion: 4, comentario: "a".repeat(1001) }, "comentario"],
  ])("400 con %s", async (_caso, cuerpo, campo) => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);

    const respuesta = await valorar(cliente.token, prestador.servicioId, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(detalleDe(respuesta.body, campo)).toBeDefined();
  });

  it("el comentario es opcional: solo estrellas está bien", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);

    const respuesta = await valorar(cliente.token, prestador.servicioId, { calificacion: 3, comentario: "   " });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.valoracion.comentario).toBeNull();
  });

  it("con un contacto de hace 61 días: 403 PLAZO_VENCIDO; con uno de hace 59, sí", async () => {
    const prestador = await crearPrestador();
    const tarde = await crearCliente();
    await contactar(tarde.id, prestador, 61);
    const aTiempo = await crearCliente();
    await contactar(aTiempo.id, prestador, 59);

    const rechazada = await valorar(tarde.token, prestador.servicioId);
    expect(rechazada.status).toBe(403);
    expect(rechazada.body.error.codigo).toBe("PLAZO_VENCIDO");
    expect((await valorar(aTiempo.token, prestador.servicioId)).status).toBe(201);
  });

  it("un prestador valorándose a sí mismo: 403, aunque tenga un contacto consigo mismo", async () => {
    const prestador = await crearPrestador();
    await contactar(prestador.id, prestador);

    const respuesta = await valorar(prestador.token, prestador.servicioId);

    expect(respuesta.status).toBe(403);
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("un prestador sin servicios visibles no se puede valorar: 404", async () => {
    const prestador = await crearPrestador();
    await prisma.servicio.update({ where: { id: prestador.servicioId }, data: { estado: "PAUSADO" } });
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);

    expect((await valorar(cliente.token, prestador.servicioId)).status).toBe(404);
    expect((await listaServicio(prestador.servicioId)).status).toBe(404);
    expect((await lista(prestador.perfilId)).status).toBe(404);
  });
});

describe("Resumen: promedio y distribución", () => {
  it("con 2 valoraciones no hay promedio ni distribución, solo el conteo; con 3 sí, y el valor es correcto", async () => {
    const prestador = await crearPrestador();
    await valoracionDe(prestador, 5);
    await valoracionDe(prestador, 4);

    const conDos = await lista(prestador.perfilId);
    expect(conDos.body.resumen).toEqual({ cantidad: 2, promedio: null, distribucion: null });

    await valoracionDe(prestador, 4);
    const conTres = await lista(prestador.perfilId);
    // (5 + 4 + 4) / 3 = 4,333… → 4,3
    expect(conTres.body.resumen).toEqual({ cantidad: 3, promedio: 4.3, distribucion: { "1": 0, "2": 0, "3": 0, "4": 2, "5": 1 } });
  });

  it("redondea a un decimal con la mitad hacia arriba: 5, 5, 4, 3 → 4,25 → 4,3", async () => {
    const prestador = await crearPrestador();
    for (const estrellas of [5, 5, 4, 3]) await valoracionDe(prestador, estrellas);

    expect((await lista(prestador.perfilId)).body.resumen.promedio).toBe(4.3);
  });

  it("el mismo resumen en el buscador, la página del servicio y el perfil", async () => {
    const prestador = await crearPrestador();
    for (const estrellas of [5, 4, 3]) await valoracionDe(prestador, estrellas);

    const busqueda = await request(app).get("/servicios");
    expect(busqueda.body.resultados[0].valoraciones).toEqual({ cantidad: 3, promedio: 4 });

    const pagina = await request(app).get(`/servicios/${prestador.servicioId}`);
    expect(pagina.body.servicio.valoraciones).toMatchObject({ cantidad: 3, promedio: 4 });

    const perfil = await request(app).get(`/prestadores/${prestador.perfilId}/publico`);
    expect(perfil.body.prestador.valoraciones).toEqual({ cantidad: 3, promedio: 4, distribucion: { "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 } });
  });

  it("sin valoraciones: conteo 0 y promedio null en el buscador (nunca un cero como promedio)", async () => {
    await crearPrestador();

    const busqueda = await request(app).get("/servicios");
    expect(busqueda.body.resultados[0].valoraciones).toEqual({ cantidad: 0, promedio: null });
  });

  it("ocultar una valoración la saca del promedio, del conteo y de la lista", async () => {
    const prestador = await crearPrestador();
    await valoracionDe(prestador, 5);
    await valoracionDe(prestador, 5);
    await valoracionDe(prestador, 5);
    const { id } = await valoracionDe(prestador, 1, "Pésimo, un estafador, no lo contraten.");
    expect((await lista(prestador.perfilId)).body.resumen).toMatchObject({ cantidad: 4, promedio: 4 });

    await objetar(prestador.token, id);
    const administrador = await crearAdministrador();
    expect((await decidir(administrador.token, id, "ocultar")).status).toBe(200);

    const despues = await lista(prestador.perfilId);
    expect(despues.body.resumen).toMatchObject({ cantidad: 3, promedio: 5 });
    expect(despues.body.total).toBe(3);
    expect(despues.body.valoraciones.map((valoracion: { id: string }) => valoracion.id)).not.toContain(id);
    const busqueda = await request(app).get("/servicios");
    expect(busqueda.body.resultados[0].valoraciones).toEqual({ cantidad: 3, promedio: 5 });
  });
});

describe("GET /prestadores/:id/valoraciones (pública)", () => {
  it("no incluye nombre completo, correo ni RUT del cliente: solo el nombre de pila", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente({ nombre: "Camila Andrea Torres Soto" });
    await contactar(cliente.id, prestador);
    await valorar(cliente.token, prestador.servicioId, { calificacion: 5, comentario: "Impecable, muy recomendable." });

    const respuesta = await lista(prestador.perfilId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.valoraciones[0]).toMatchObject({
      calificacion: 5,
      comentario: "Impecable, muy recomendable.",
      editada: false,
      cliente: { nombre: "Camila", foto: null },
    });
    expect(respuesta.text).not.toContain("Torres");
    expect(respuesta.text).not.toContain("Andrea");
    expect(respuesta.text).not.toContain(cliente.correo);
    expect(respuesta.text).not.toContain(String(cliente.rut));
    expect(respuesta.text).not.toMatch(/"(correo|rut|clienteId|contactoId)"/);
  });

  it("pagina, más recientes primero", async () => {
    const prestador = await crearPrestador();
    for (const estrellas of [1, 2, 3]) await valoracionDe(prestador, estrellas);

    const primera = await lista(prestador.perfilId, "?pagina=1&porPagina=2");
    const segunda = await lista(prestador.perfilId, "?pagina=2&porPagina=2");

    expect(primera.body.total).toBe(3);
    expect(primera.body.valoraciones.map((valoracion: { calificacion: number }) => valoracion.calificacion)).toEqual([3, 2]);
    expect(segunda.body.valoraciones.map((valoracion: { calificacion: number }) => valoracion.calificacion)).toEqual([1]);
  });
});

describe("La valoración propia", () => {
  it("GET mia: sin contacto explica el motivo, sin decir nada de las de otros", async () => {
    const prestador = await crearPrestador();
    await valoracionDe(prestador, 5, "Muy buen trabajo, lo recomiendo.");
    const cliente = await crearCliente();

    const respuesta = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${cliente.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ valoracion: null, puedeValorar: false, motivo: "SIN_CONTACTO", plazoHasta: null });
  });

  it("GET mia con una valoración publicada: la muestra y ya no ofrece valorar (YA_VALORADA)", async () => {
    const prestador = await crearPrestador();
    const { cliente } = await valoracionDe(prestador, 4, "Buen trabajo, muy puntual.");

    const respuesta = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${cliente.token}`);

    expect(respuesta.body).toMatchObject({
      valoracion: { calificacion: 4, comentario: "Buen trabajo, muy puntual.", estado: "PUBLICADA" },
      puedeValorar: false,
      motivo: "YA_VALORADA",
      plazoHasta: null,
    });
  });

  it("el cliente no puede retirarla ni editarla por otra vía: no hay DELETE, PUT ni PATCH (404)", async () => {
    const prestador = await crearPrestador();
    const { cliente } = await valoracionDe(prestador, 4, "Buen trabajo, muy puntual.");
    const ruta = `/servicios/${prestador.servicioId}/valoraciones/mia`;
    const autorizacion = `Bearer ${cliente.token}`;

    expect((await request(app).delete(ruta).set("Authorization", autorizacion)).status).toBe(404);
    expect((await request(app).put(ruta).set("Authorization", autorizacion).send({ calificacion: 1 })).status).toBe(404);
    expect((await request(app).patch(ruta).set("Authorization", autorizacion).send({ calificacion: 1 })).status).toBe(404);
    expect(await prisma.valoracion.findFirstOrThrow()).toMatchObject({ calificacion: 4, comentario: "Buen trabajo, muy puntual." });
  });

  it("si se oculta: el cliente ve que fue ocultada por moderación y no puede volver a valorar", async () => {
    const prestador = await crearPrestador();
    const { cliente, id } = await valoracionDe(prestador, 1, "Un desastre, no lo recomiendo.");
    await objetar(prestador.token, id);
    await decidir((await crearAdministrador()).token, id, "ocultar", "Contiene acusaciones sin relación con el servicio.");

    const propia = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${cliente.token}`);
    expect(propia.body.valoracion).toMatchObject({ estado: "OCULTA", ocultaPorModeracion: true });
    expect(propia.body).toMatchObject({ puedeValorar: false, motivo: "YA_VALORADA" });

    const edicion = await valorar(cliente.token, prestador.servicioId, { calificacion: 5 });
    expect(edicion.status).toBe(409);
    expect((await prisma.valoracion.findUniqueOrThrow({ where: { id } })).estado).toBe("OCULTA");
  });
});

describe("Objeciones del prestador", () => {
  it("un prestador objeta una valoración recibida: entra a la cola con texto, calificación y motivo", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1, "Muy mala atención, un fraude total.");
    const administrador = await crearAdministrador();

    const respuesta = await objetar(prestador.token, id, { motivo: "INFORMACION_FALSA", comentario: "Nunca trabajé en su casa." });

    expect(respuesta.status).toBe(201);
    // La objeción no toca la valoración: sigue publicada hasta que decida un administrador.
    expect((await prisma.valoracion.findUniqueOrThrow({ where: { id } })).estado).toBe("PUBLICADA");
    const casos = (await cola(administrador.token)).body.casos;
    expect(casos).toEqual([
      expect.objectContaining({
        tipo: "VALORACION",
        valoracion: expect.objectContaining({ id, calificacion: 1, comentario: "Muy mala atención, un fraude total.", estado: "PUBLICADA" }),
        objecion: { motivo: "INFORMACION_FALSA", comentario: "Nunca trabajé en su casa." },
      }),
    ]);
  });

  it("la cola mezcla servicios reportados y valoraciones objetadas", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 2, "No volvería a contratarlo.");
    await objetar(prestador.token, id);
    const otro = await crearPrestador();
    const reportante = await crearCliente();
    await request(app)
      .post(`/servicios/${otro.servicioId}/reportes`)
      .set("Authorization", `Bearer ${reportante.token}`)
      .send({ motivo: "CONTENIDO_ENGANOSO" });

    const casos = (await cola((await crearAdministrador()).token)).body.casos;

    expect(casos.map((caso: { tipo: string }) => caso.tipo).sort()).toEqual(["SERVICIO", "VALORACION"]);
  });

  it("con OTRO el comentario es obligatorio; un motivo de servicios no sirve", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);

    expect((await objetar(prestador.token, id, { motivo: "OTRO" })).status).toBe(400);
    expect((await objetar(prestador.token, id, { motivo: "CONTENIDO_ENGANOSO" })).status).toBe(400);
    expect((await objetar(prestador.token, id, { motivo: "OTRO", comentario: "Es de otra persona con mi nombre." })).status).toBe(201);
  });

  it("un prestador objetando una valoración de otro prestador: 403", async () => {
    const prestador = await crearPrestador();
    const otro = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);

    expect((await objetar(otro.token, id)).status).toBe(403);
    expect(await prisma.denuncia.count()).toBe(0);
  });

  it("un cliente no puede objetar: 403", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);

    expect((await objetar((await crearCliente()).token, id)).status).toBe(403);
  });

  it("objetar dos veces la misma valoración: 409, aunque la primera ya se haya desestimado", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);
    expect((await objetar(prestador.token, id)).status).toBe(201);

    const segunda = await objetar(prestador.token, id, { motivo: "INFORMACION_FALSA" });
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.codigo).toBe("VALORACION_YA_OBJETADA");

    await decidir((await crearAdministrador()).token, id, "desestimar");
    expect((await objetar(prestador.token, id)).status).toBe(409);
    expect(await prisma.denuncia.count()).toBe(1);
  });

  it("OCULTAR una valoración solo lo hace un administrador: un prestador recibe 403, y no existe ruta para eliminar", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1, "Pésimo trabajo, no lo contraten.");
    await objetar(prestador.token, id);

    expect((await decidir(prestador.token, id, "ocultar")).status).toBe(403);
    expect((await decidir(prestador.token, id, "desestimar")).status).toBe(403);
    const borrar = await request(app).delete(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${prestador.token}`);
    expect(borrar.status).toBe(404);
    const cliente = await crearCliente();
    expect((await decidir(cliente.token, id, "ocultar")).status).toBe(403);

    // Sigue publicada, sin decisiones.
    expect((await prisma.valoracion.findUniqueOrThrow({ where: { id } })).estado).toBe("PUBLICADA");
    expect(await prisma.decisionReporte.count()).toBe(0);
  });

  it("desestimar la objeción deja la valoración publicada y la decisión en la bitácora", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 2, "No cumplió con el horario acordado.");
    await objetar(prestador.token, id);
    const administrador = await crearAdministrador();

    const respuesta = await decidir(administrador.token, id, "desestimar", "Es una opinión legítima sobre el servicio.");

    expect(respuesta.status).toBe(200);
    expect((await prisma.valoracion.findUniqueOrThrow({ where: { id } })).estado).toBe("PUBLICADA");
    expect(await prisma.decisionReporte.findMany({ where: { valoracionId: id } })).toEqual([
      expect.objectContaining({ accion: "DESESTIMAR", motivo: "Es una opinión legítima sobre el servicio.", administradorId: administrador.id, servicioId: null }),
    ]);
    expect((await cola(administrador.token)).body.casos).toHaveLength(0);
    const resueltos = (await cola(administrador.token, "resueltos")).body.casos;
    expect(resueltos[0]).toMatchObject({ tipo: "VALORACION", decision: { accion: "DESESTIMAR" } });
  });

  it("decidir exige motivo", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);
    await objetar(prestador.token, id);

    expect((await decidir((await crearAdministrador()).token, id, "ocultar", "corto")).status).toBe(400);
  });

  it("si se oculta, el prestador la ve retirada con el motivo, y el estado de su objeción", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1, "Pésimo, es un ladrón y vive en Pasaje 4.");
    await objetar(prestador.token, id, { motivo: "DATOS_PERSONALES_EXPUESTOS" });
    await decidir((await crearAdministrador()).token, id, "ocultar", "Expone la dirección de una persona.");

    const respuesta = await request(app).get("/prestadores/yo/valoraciones").set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.valoraciones[0]).toMatchObject({
      id,
      estado: "OCULTA",
      retirada: { motivo: "Expone la dirección de una persona." },
      objecion: { motivo: "DATOS_PERSONALES_EXPUESTOS", estado: "RESUELTA", resolucion: "Expone la dirección de una persona." },
    });
  });

  it("la bitácora de decisiones rechaza modificaciones y borrados", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);
    await objetar(prestador.token, id);
    await decidir((await crearAdministrador()).token, id, "ocultar");
    const [decision] = await prisma.decisionReporte.findMany({ where: { valoracionId: id } });
    if (!decision) throw new Error("Falta la decisión");

    await expect(prisma.$executeRaw`UPDATE decisiones_reporte SET motivo = 'otro motivo cualquiera' WHERE id = ${decision.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM decisiones_reporte WHERE id = ${decision.id}`).rejects.toThrow();
    expect((await prisma.decisionReporte.findUniqueOrThrow({ where: { id: decision.id } })).motivo).toBe(decision.motivo);
  });

  it("la base impide una decisión sobre dos objetos, o «ocultar servicio» sobre una valoración", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1);
    const administrador = await crearAdministrador();
    const base = { motivo: "Prueba de la regla de la base.", reportesCerrados: 0, administradorId: administrador.id };

    await expect(prisma.decisionReporte.create({ data: { ...base, accion: "DESESTIMAR", servicioId: prestador.servicioId, valoracionId: id } })).rejects.toThrow();
    await expect(prisma.decisionReporte.create({ data: { ...base, accion: "OCULTAR_SERVICIO", valoracionId: id } })).rejects.toThrow();
  });
});

describe("Valoraciones por servicio", () => {
  it("una valoración aparece en su servicio y no en otro del mismo prestador; el perfil las junta, cada una con su servicio", async () => {
    const prestador = await crearPrestador();
    const destape = await otroServicio(prestador);
    await valoracionDe(prestador, 5, "El calefont quedó como nuevo.");
    await valoracionDe(destape, 2, "Volvió a taparse al otro día.");

    const deCalefont = await listaServicio(prestador.servicioId);
    const deDestape = await listaServicio(destape.servicioId);
    const delPerfil = await lista(prestador.perfilId);

    expect(deCalefont.body.valoraciones.map((v: { comentario: string }) => v.comentario)).toEqual(["El calefont quedó como nuevo."]);
    expect(deCalefont.body.resumen).toMatchObject({ cantidad: 1 });
    expect(deDestape.body.valoraciones.map((v: { comentario: string }) => v.comentario)).toEqual(["Volvió a taparse al otro día."]);
    expect(delPerfil.body.resumen).toMatchObject({ cantidad: 2 });
    expect(delPerfil.body.valoraciones.map((v: { servicio: { titulo: string } }) => v.servicio.titulo).sort()).toEqual([
      "Destape de cañerías",
      "Reparación de calefont",
    ]);
  });

  it("el promedio de un servicio no mezcla los de otro; el del perfil es el general", async () => {
    const prestador = await crearPrestador();
    const destape = await otroServicio(prestador);
    for (const estrellas of [5, 5, 5]) await valoracionDe(prestador, estrellas);
    for (const estrellas of [1, 1, 1]) await valoracionDe(destape, estrellas);

    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).body.servicio.valoraciones).toMatchObject({ cantidad: 3, promedio: 5 });
    expect((await request(app).get(`/servicios/${destape.servicioId}`)).body.servicio.valoraciones).toMatchObject({ cantidad: 3, promedio: 1 });
    const busqueda = await request(app).get("/servicios");
    const porTitulo = new Map(
      (busqueda.body.resultados as { titulo: string; valoraciones: unknown }[]).map((resultado) => [resultado.titulo, resultado.valoraciones]),
    );
    expect(porTitulo.get("Reparación de calefont")).toEqual({ cantidad: 3, promedio: 5 });
    expect(porTitulo.get("Destape de cañerías")).toEqual({ cantidad: 3, promedio: 1 });

    const perfil = await request(app).get(`/prestadores/${prestador.perfilId}/publico`);
    expect(perfil.body.prestador.valoraciones).toMatchObject({ cantidad: 6, promedio: 3 });
    const servicios = new Map(
      (perfil.body.prestador.servicios as { titulo: string; valoraciones: unknown }[]).map((servicio) => [servicio.titulo, servicio.valoraciones]),
    );
    expect(servicios.get("Reparación de calefont")).toEqual({ cantidad: 3, promedio: 5 });
    expect(servicios.get("Destape de cañerías")).toEqual({ cantidad: 3, promedio: 1 });
  });

  it("haber contactado OTRO servicio del mismo prestador no habilita a valorar este: 403 SIN_CONTACTO", async () => {
    const prestador = await crearPrestador();
    const destape = await otroServicio(prestador);
    const cliente = await crearCliente();
    await contactar(cliente.id, destape);

    const respuesta = await valorar(cliente.token, prestador.servicioId);
    const mia = await request(app).get(`/servicios/${prestador.servicioId}/valoraciones/mia`).set("Authorization", `Bearer ${cliente.token}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_CONTACTO");
    expect(mia.body).toMatchObject({ puedeValorar: false, motivo: "SIN_CONTACTO" });
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("el mismo cliente puede valorar dos servicios del mismo prestador, pero cada uno una sola vez", async () => {
    const prestador = await crearPrestador();
    const destape = await otroServicio(prestador);
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);
    await contactar(cliente.id, destape);

    expect((await valorar(cliente.token, prestador.servicioId, { calificacion: 5 })).status).toBe(201);
    expect((await valorar(cliente.token, destape.servicioId, { calificacion: 3 })).status).toBe(201);
    const repetida = await valorar(cliente.token, destape.servicioId, { calificacion: 1 });

    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("VALORACION_YA_EXISTE");
    expect(await prisma.valoracion.count()).toBe(2);
  });

  it("un servicio que no existe o no es visible: 404 al valorar, al pedir la propia y al listar", async () => {
    const prestador = await crearPrestador();
    const pausado = await otroServicio(prestador, "Servicio en pausa");
    await prisma.servicio.update({ where: { id: pausado.servicioId }, data: { estado: "PAUSADO" } });
    const cliente = await crearCliente();
    await contactar(cliente.id, pausado);

    for (const id of [pausado.servicioId, "no-existe"]) {
      expect((await valorar(cliente.token, id)).status).toBe(404);
      expect((await request(app).get(`/servicios/${id}/valoraciones/mia`).set("Authorization", `Bearer ${cliente.token}`)).status).toBe(404);
      expect((await listaServicio(id)).status).toBe(404);
    }
  });

  it("ya no se valora por prestador: POST /prestadores/:id/valoraciones no existe (404)", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador);

    const respuesta = await request(app)
      .post(`/prestadores/${prestador.perfilId}/valoraciones`)
      .set("Authorization", `Bearer ${cliente.token}`)
      .send({ calificacion: 5 });

    expect(respuesta.status).toBe(404);
    expect(await prisma.valoracion.count()).toBe(0);
  });

  it("contactar exige indicar el servicio: sin ?servicio= responde 400 y no registra nada", async () => {
    const prestador = await crearPrestador();
    await prisma.perfilPrestador.update({ where: { id: prestador.perfilId }, data: { telefono: "+56912345678" } });
    const cliente = await crearCliente();

    const sinServicio = await request(app).get(`/prestadores/${prestador.perfilId}/contacto`).set("Authorization", `Bearer ${cliente.token}`);
    const conServicio = await request(app)
      .get(`/prestadores/${prestador.perfilId}/contacto`)
      .query({ servicio: prestador.servicioId })
      .set("Authorization", `Bearer ${cliente.token}`);

    expect(sinServicio.status).toBe(400);
    expect(conServicio.status).toBe(200);
    const contactos = await prisma.contacto.findMany({ where: { clienteId: cliente.id } });
    expect(contactos.map((contacto) => contacto.servicioId)).toEqual([prestador.servicioId]);
  });

  it("el administrador ve en la cola qué servicio se valoró", async () => {
    const prestador = await crearPrestador();
    const { id } = await valoracionDe(prestador, 1, "No volvería a contratarlo nunca más.");
    await objetar(prestador.token, id);

    const respuesta = await cola((await crearAdministrador()).token);
    const caso = respuesta.body.casos.find((c: { tipo: string }) => c.tipo === "VALORACION");

    expect(caso.valoracion.servicio).toBe("Reparación de calefont");
  });
});
