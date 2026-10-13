import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

const CONTRASENA = "contrasena-segura-123";
const SANTIAGO = 13101;
const HACE_UN_MES = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);
afterAll(vaciar);

let secuencia = 0;

interface OpcionesUsuario {
  correoVerificado?: boolean;
  /** Fecha de creación de la cuenta (por defecto, hace un mes). */
  creadoEn?: Date;
}

async function crearUsuario(rol: Rol, opciones: OpcionesUsuario = {}) {
  secuencia += 1;
  const correo = `persona${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      rut: rol === "PRESTADOR" ? `${40000000 + secuencia}-K` : null,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
      creadoEn: opciones.creadoEn ?? HACE_UN_MES,
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

/** Prestador verificado con un servicio PUBLICADO en la categoría pedida. */
async function crearPrestadorConServicio(categoria = "gasfiteria", titulo = "Gasfitería a domicilio") {
  const usuario = await crearUsuario("PRESTADOR");
  const { id: categoriaId } = await prisma.categoria.findUniqueOrThrow({ where: { slug: categoria } });
  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: "+56912345678",
      descripcion: "Prestador con experiencia en la zona.",
      comunasAtencion: { create: [{ comunaId: SANTIAGO }] },
    },
  });
  const servicio = await prisma.servicio.create({
    data: {
      prestadorId: perfil.id,
      categoriaId,
      titulo,
      descripcion: "Trabajos garantizados, con boleta y materiales de primera calidad.",
      estado: "PUBLICADO",
    },
  });
  return { ...usuario, servicioId: servicio.id };
}

function reportar(token: string, servicioId: string, cuerpo: object = { motivo: "CONTENIDO_ENGANOSO" }) {
  return request(app).post(`/servicios/${servicioId}/reportes`).set("Authorization", `Bearer ${token}`).send(cuerpo);
}

function cola(token: string, estado: "pendientes" | "resueltos" = "pendientes") {
  return request(app).get("/admin/reportes").query({ estado }).set("Authorization", `Bearer ${token}`);
}

function decidir(token: string, servicioId: string, accion: "desestimar" | "ocultar", motivo = "Revisado: la publicación cumple las reglas.") {
  return request(app).patch(`/admin/reportes/${servicioId}/${accion}`).set("Authorization", `Bearer ${token}`).send({ motivo });
}

/** n clientes distintos que reportan el servicio. */
async function reportantes(n: number, servicioId: string) {
  const clientes = [];
  for (let i = 0; i < n; i += 1) {
    const cliente = await crearUsuario("CLIENTE");
    expect((await reportar(cliente.token, servicioId)).status).toBe(202);
    clientes.push(cliente);
  }
  return clientes;
}

describe("POST /servicios/:id/reportes", () => {
  it("con correo verificado, crea el reporte", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    const respuesta = await reportar(cliente.token, prestador.servicioId, { motivo: "IMAGENES_INAPROPIADAS", comentario: "Hay una foto que no corresponde." });

    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual({ mensaje: "Gracias. Revisaremos esta publicación." });
    const denuncias = await prisma.denuncia.findMany({ where: { servicioId: prestador.servicioId } });
    expect(denuncias).toEqual([
      expect.objectContaining({ denuncianteId: cliente.id, motivo: "IMAGENES_INAPROPIADAS", detalle: "Hay una foto que no corresponde.", estado: "ABIERTA" }),
    ]);
  });

  it("sin correo verificado: 403; sin sesión: 401", async () => {
    const prestador = await crearPrestadorConServicio();
    const sinVerificar = await crearUsuario("CLIENTE", { correoVerificado: false });

    expect((await reportar(sinVerificar.token, prestador.servicioId)).status).toBe(403);
    expect((await request(app).post(`/servicios/${prestador.servicioId}/reportes`).send({ motivo: "OTRO", comentario: "algo raro pasa" })).status).toBe(401);
    expect(await prisma.denuncia.count()).toBe(0);
  });

  it("reportar dos veces el mismo servicio no duplica, y responde exactamente igual", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    const primera = await reportar(cliente.token, prestador.servicioId);
    const segunda = await reportar(cliente.token, prestador.servicioId, { motivo: "OTRO", comentario: "Insisto, es engañoso." });

    expect(segunda.status).toBe(primera.status);
    expect(segunda.body).toEqual(primera.body);
    expect(await prisma.denuncia.count({ where: { servicioId: prestador.servicioId } })).toBe(1);
  });

  it("un prestador no puede reportar su propio servicio", async () => {
    const prestador = await crearPrestadorConServicio();

    const respuesta = await reportar(prestador.token, prestador.servicioId);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("REPORTE_NO_PERMITIDO");
  });

  it("un prestador no puede reportar un servicio de su misma categoría, pero sí de otra", async () => {
    const competidor = await crearPrestadorConServicio("gasfiteria", "Gasfitería del competidor");
    const otroGasfiter = await crearPrestadorConServicio("gasfiteria", "Gasfitería propia");
    const electricista = await crearPrestadorConServicio("electricidad", "Instalaciones eléctricas");

    const mismaCategoria = await reportar(otroGasfiter.token, competidor.servicioId);
    const otraCategoria = await reportar(electricista.token, competidor.servicioId);

    expect(mismaCategoria.status).toBe(403);
    expect(mismaCategoria.body.error.codigo).toBe("REPORTE_NO_PERMITIDO");
    expect(otraCategoria.status).toBe(202);
  });

  it("el sexto reporte del día: 429; retirar uno no libera cupo", async () => {
    const cliente = await crearUsuario("CLIENTE");
    const servicios: string[] = [];
    for (const categoria of ["gasfiteria", "electricidad", "banqueteria", "soldadura", "carpinteria", "cerrajeria"]) {
      servicios.push((await crearPrestadorConServicio(categoria, `Servicio de ${categoria}`)).servicioId);
    }

    for (const servicioId of servicios.slice(0, 5)) expect((await reportar(cliente.token, servicioId)).status).toBe(202);
    await request(app).delete(`/servicios/${servicios[0]}/reportes/mio`).set("Authorization", `Bearer ${cliente.token}`);

    const sexto = await reportar(cliente.token, String(servicios[5]));

    expect(sexto.status).toBe(429);
    expect(sexto.body.error.codigo).toBe("DEMASIADOS_REPORTES");
    expect(await prisma.denuncia.count({ where: { servicioId: servicios[5] } })).toBe(0);
  });

  it("motivo OTRO sin comentario: 400; con comentario, se acepta", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    const sinComentario = await reportar(cliente.token, prestador.servicioId, { motivo: "OTRO" });
    const comentarioVacio = await reportar(cliente.token, prestador.servicioId, { motivo: "OTRO", comentario: "   " });
    const conComentario = await reportar(cliente.token, prestador.servicioId, { motivo: "OTRO", comentario: "Pide pagos por adelantado fuera de la plataforma." });

    expect(sinComentario.status).toBe(400);
    expect(sinComentario.body.error.detalles[0].campo).toBe("comentario");
    expect(comentarioVacio.status).toBe(400);
    expect(conComentario.status).toBe(202);
  });

  it("rechaza motivos que no están en la lista y servicios que no están publicados", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");
    await prisma.servicio.update({ where: { id: prestador.servicioId }, data: { estado: "PAUSADO" } });

    expect((await reportar(cliente.token, prestador.servicioId, { motivo: "NO_ME_GUSTA" })).status).toBe(400);
    expect((await reportar(cliente.token, prestador.servicioId)).status).toBe(404);
    expect((await reportar(cliente.token, "no-existe")).status).toBe(404);
  });
});

describe("Retirar y consultar el propio reporte", () => {
  it("retira el propio reporte (queda RETIRADA, no se borra) y sale de la cola", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");
    const admin = await crearUsuario("ADMINISTRADOR");
    await reportar(cliente.token, prestador.servicioId);

    const mio = await request(app).get(`/servicios/${prestador.servicioId}/reportes/mio`).set("Authorization", `Bearer ${cliente.token}`);
    expect(mio.body.reporte).toMatchObject({ motivo: "CONTENIDO_ENGANOSO" });

    const retiro = await request(app).delete(`/servicios/${prestador.servicioId}/reportes/mio`).set("Authorization", `Bearer ${cliente.token}`);

    expect(retiro.status).toBe(204);
    expect((await prisma.denuncia.findFirstOrThrow({ where: { servicioId: prestador.servicioId } })).estado).toBe("RETIRADA");
    expect((await cola(admin.token)).body.servicios).toHaveLength(0);
    const despues = await request(app).get(`/servicios/${prestador.servicioId}/reportes/mio`).set("Authorization", `Bearer ${cliente.token}`);
    expect(despues.body.reporte).toBeNull();
    // Se puede volver a reportar.
    expect((await reportar(cliente.token, prestador.servicioId)).status).toBe(202);
    expect(await prisma.denuncia.count({ where: { servicioId: prestador.servicioId, estado: "ABIERTA" } })).toBe(1);
  });

  it("retirar sin tener reporte responde igual (204): no revela nada", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    const retiro = await request(app).delete(`/servicios/${prestador.servicioId}/reportes/mio`).set("Authorization", `Bearer ${cliente.token}`);

    expect(retiro.status).toBe(204);
  });
});

describe("La regla central: los reportes no ocultan nada por sí solos", () => {
  it("un servicio con muchos reportes sigue visible en su página y en la búsqueda mientras nadie decida", async () => {
    const prestador = await crearPrestadorConServicio("gasfiteria", "Gasfitería muy solicitada");
    await reportantes(8, prestador.servicioId);

    const publica = await request(app).get(`/servicios/${prestador.servicioId}`);
    const busqueda = await request(app).get("/servicios").query({ q: "gasfiteria solicitada" });

    expect(publica.status).toBe(200);
    expect(busqueda.body.resultados.map((resultado: { id: string }) => resultado.id)).toContain(prestador.servicioId);
    expect((await prisma.servicio.findUniqueOrThrow({ where: { id: prestador.servicioId } })).estado).toBe("PUBLICADO");
    // Y la página pública no dice nada de los reportes.
    expect(JSON.stringify(publica.body)).not.toMatch(/report|denuncia/i);
  });
});

describe("GET /admin/reportes: la cola", () => {
  it("agrupa por servicio y cuenta personas distintas, no reportes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const conDos = await crearPrestadorConServicio("gasfiteria", "Servicio con dos personas");
    const conUna = await crearPrestadorConServicio("electricidad", "Servicio con una persona");
    await reportantes(2, conDos.servicioId);
    await reportantes(1, conUna.servicioId);

    const pendientes = await cola(admin.token);

    expect(pendientes.status).toBe(200);
    expect(pendientes.body.total).toBe(2);
    const porServicio = Object.fromEntries(
      pendientes.body.servicios.map((fila: { servicio: { titulo: string }; personas: number }) => [fila.servicio.titulo, fila.personas]),
    );
    expect(porServicio).toEqual({ "Servicio con dos personas": 2, "Servicio con una persona": 1 });

    // La misma persona vuelve a reportar después de una desestimación: en el
    // historial hay dos reportes suyos, pero sigue siendo UNA persona.
    await decidir(admin.token, conUna.servicioId, "desestimar");
    const cliente = await crearUsuario("CLIENTE");
    await reportar(cliente.token, conUna.servicioId);
    await decidir(admin.token, conUna.servicioId, "desestimar");
    await reportar(cliente.token, conUna.servicioId);
    await decidir(admin.token, conUna.servicioId, "desestimar");
    const resueltos = await cola(admin.token, "resueltos");
    const fila = resueltos.body.servicios.find((otra: { servicio: { id: string } }) => otra.servicio.id === conUna.servicioId);
    expect(fila).toMatchObject({ personas: 2, reportes: 3 });
  });

  it("3 personas distintas marcan prioridad alta, y va primero aunque sea más reciente", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const antiguo = await crearPrestadorConServicio("gasfiteria", "Reportado hace tiempo por dos");
    const urgente = await crearPrestadorConServicio("electricidad", "Reportado recién por tres");
    await reportantes(2, antiguo.servicioId);
    await prisma.denuncia.updateMany({ where: { servicioId: antiguo.servicioId }, data: { creadoEn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } });
    await reportantes(3, urgente.servicioId);

    const { body } = await cola(admin.token);

    expect(body.servicios.map((fila: { servicio: { titulo: string }; prioridad: string }) => [fila.servicio.titulo, fila.prioridad])).toEqual([
      ["Reportado recién por tres", "ALTA"],
      ["Reportado hace tiempo por dos", "NORMAL"],
    ]);
    const antiguoEnCola = body.servicios[1];
    expect(antiguoEnCola.esperaMinutos).toBeGreaterThanOrEqual(3 * 24 * 60 - 1);
    expect(antiguoEnCola).toMatchObject({ motivoFrecuente: "CONTENIDO_ENGANOSO", servicio: { prestador: antiguo.nombre } });
  });

  it("el motivo más frecuente es el que más se repite", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio();
    for (const motivo of ["IMAGENES_INAPROPIADAS", "SUPLANTACION_DE_IDENTIDAD", "SUPLANTACION_DE_IDENTIDAD"]) {
      const cliente = await crearUsuario("CLIENTE");
      await reportar(cliente.token, prestador.servicioId, { motivo });
    }

    expect((await cola(admin.token)).body.servicios[0].motivoFrecuente).toBe("SUPLANTACION_DE_IDENTIDAD");
  });

  it("un prestador o un cliente no pueden acceder a /admin/reportes: 403", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    expect((await cola(prestador.token)).status).toBe(403);
    expect((await cola(cliente.token)).status).toBe(403);
    expect((await request(app).get(`/admin/reportes/${prestador.servicioId}`).set("Authorization", `Bearer ${prestador.token}`)).status).toBe(403);
    expect((await decidir(prestador.token, prestador.servicioId, "desestimar")).status).toBe(403);
    expect((await request(app).get("/admin/reportes")).status).toBe(401);
  });
});

describe("Anonimato de quien reporta", () => {
  it("ni la cola ni el detalle revelan quién reportó; el detalle dice si la cuenta tenía más de una semana", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio();
    const veterana = await crearUsuario("CLIENTE", { creadoEn: HACE_UN_MES });
    const nueva = await crearUsuario("CLIENTE", { creadoEn: new Date() });
    await reportar(veterana.token, prestador.servicioId, { motivo: "CONTENIDO_ENGANOSO", comentario: "Promete garantía y no la da." });
    await reportar(nueva.token, prestador.servicioId, { motivo: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION" });

    const enCola = await cola(admin.token);
    const detalle = await request(app).get(`/admin/reportes/${prestador.servicioId}`).set("Authorization", `Bearer ${admin.token}`);

    expect(detalle.status).toBe(200);
    for (const respuesta of [enCola, detalle]) {
      const texto = JSON.stringify(respuesta.body);
      for (const persona of [veterana, nueva]) {
        expect(texto).not.toContain(persona.id);
        expect(texto).not.toContain(persona.correo);
        expect(texto).not.toContain(persona.nombre);
      }
      expect(texto).not.toMatch(/denunciante/i);
    }
    expect(detalle.body.personas).toBe(2);
    expect(
      detalle.body.reportes.map((reporte: { motivo: string; comentario: string | null; cuentaConMasDeUnaSemana: boolean }) => [
        reporte.motivo,
        reporte.comentario,
        reporte.cuentaConMasDeUnaSemana,
      ]),
    ).toEqual([
      ["CONTENIDO_ENGANOSO", "Promete garantía y no la da.", true],
      ["DATOS_DE_CONTACTO_EN_LA_DESCRIPCION", null, false],
    ]);
  });
});

describe("Decisiones", () => {
  it("desestimar cierra los reportes, el servicio sigue visible y la decisión queda en la bitácora", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio("gasfiteria", "Gasfitería desestimada");
    await reportantes(3, prestador.servicioId);

    const respuesta = await decidir(admin.token, prestador.servicioId, "desestimar", "La descripción coincide con lo que ofrece.");

    expect(respuesta.status).toBe(200);
    expect(await prisma.denuncia.count({ where: { servicioId: prestador.servicioId, estado: "DESESTIMADA" } })).toBe(3);
    expect(await prisma.denuncia.count({ where: { servicioId: prestador.servicioId, estado: "ABIERTA" } })).toBe(0);
    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).status).toBe(200);
    expect((await request(app).get("/servicios").query({ q: "desestimada" })).body.resultados).toHaveLength(1);
    expect(await prisma.decisionReporte.findMany({ where: { servicioId: prestador.servicioId } })).toEqual([
      expect.objectContaining({ accion: "DESESTIMAR", motivo: "La descripción coincide con lo que ofrece.", administradorId: admin.id, reportesCerrados: 3 }),
    ]);
    expect((await cola(admin.token)).body.servicios).toHaveLength(0);
    expect((await cola(admin.token, "resueltos")).body.servicios[0]).toMatchObject({
      decision: { accion: "DESESTIMAR", motivo: "La descripción coincide con lo que ofrece." },
    });
  });

  it("ocultar saca el servicio de la búsqueda y de su página, y el prestador ve el motivo sin nada de los reportes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio("gasfiteria", "Gasfitería ocultada");
    const clientes = await reportantes(3, prestador.servicioId);

    const respuesta = await decidir(admin.token, prestador.servicioId, "ocultar", "Publica datos de contacto en la descripción.");

    expect(respuesta.status).toBe(200);
    expect((await prisma.servicio.findUniqueOrThrow({ where: { id: prestador.servicioId } })).estado).toBe("OCULTO");
    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).status).toBe(404);
    expect((await request(app).get("/servicios").query({ q: "ocultada" })).body.resultados).toHaveLength(0);
    expect(await prisma.denuncia.count({ where: { servicioId: prestador.servicioId, estado: "RESUELTA" } })).toBe(3);
    expect(await prisma.decisionReporte.findFirst({ where: { servicioId: prestador.servicioId } })).toMatchObject({
      accion: "OCULTAR_SERVICIO",
      administradorId: admin.id,
    });

    const mios = await request(app).get("/servicios/mios").set("Authorization", `Bearer ${prestador.token}`);
    const servicio = mios.body.servicios[0];
    expect(servicio).toMatchObject({ estado: "OCULTO", moderacion: { motivo: "Publica datos de contacto en la descripción." } });
    // Nada sobre los reportes: ni cuántos, ni quién, ni la palabra.
    const texto = JSON.stringify(mios.body);
    expect(texto).not.toMatch(/report|denuncia|personas/i);
    for (const cliente of clientes) expect(texto).not.toContain(cliente.id);
  });

  it("toda decisión exige motivo; desestimar sin reportes pendientes es 409; no se oculta dos veces", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio();
    await reportantes(1, prestador.servicioId);

    expect((await decidir(admin.token, prestador.servicioId, "desestimar", "corto")).status).toBe(400);
    expect((await decidir(admin.token, prestador.servicioId, "ocultar", "")).status).toBe(400);
    expect((await decidir(admin.token, prestador.servicioId, "desestimar")).status).toBe(200);
    expect((await decidir(admin.token, prestador.servicioId, "desestimar")).status).toBe(409);
    expect((await decidir(admin.token, prestador.servicioId, "ocultar", "Se revisó de nuevo y no corresponde.")).status).toBe(200);
    expect((await decidir(admin.token, prestador.servicioId, "ocultar", "Se revisó de nuevo y no corresponde.")).status).toBe(409);
    expect((await decidir(admin.token, "no-existe", "ocultar", "Se revisó de nuevo y no corresponde.")).status).toBe(404);
  });

  it("la bitácora de decisiones rechaza modificaciones y borrados", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const prestador = await crearPrestadorConServicio();
    await reportantes(1, prestador.servicioId);
    await decidir(admin.token, prestador.servicioId, "desestimar");
    const decision = await prisma.decisionReporte.findFirstOrThrow({ where: { servicioId: prestador.servicioId } });

    await expect(prisma.decisionReporte.update({ where: { id: decision.id }, data: { motivo: "Otro motivo cualquiera." } })).rejects.toThrow(
      /solo admite inserciones/,
    );
    await expect(prisma.decisionReporte.delete({ where: { id: decision.id } })).rejects.toThrow(/solo admite inserciones/);
    expect(await prisma.decisionReporte.findUniqueOrThrow({ where: { id: decision.id } })).toMatchObject({ motivo: decision.motivo });
  });

  it("un servicio con reportes no se elimina, y el mensaje no revela que fue reportado", async () => {
    const prestador = await crearPrestadorConServicio();
    await reportantes(1, prestador.servicioId);

    const respuesta = await request(app).delete(`/servicios/${prestador.servicioId}`).set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("SERVICIO_CON_HISTORIAL");
    expect(JSON.stringify(respuesta.body)).not.toMatch(/report|denuncia/i);
  });
});
