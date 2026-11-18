import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Algorithm, hash } from "@node-rs/argon2";
import { fechaDeHoyEnChile } from "@localcl/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { TERMINOS_ACEPTADOS } from "../terminos.js";
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

async function crearUsuario(rol: Rol, nombre?: string) {
  secuencia += 1;
  // Sin «contratacion» en el correo: la prueba de privacidad busca esa palabra en las respuestas.
  const correo = `historial${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      ...TERMINOS_ACEPTADOS,
      correo,
      nombre: nombre ?? `Persona${secuencia} Apellido Segundo`,
      rol,
      rut: `${21000000 + secuencia}-K`,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

const crearCliente = () => crearUsuario("CLIENTE");

/** Prestador con perfil y un servicio publicado. */
async function crearPrestador(nombre = "Pedro Soto Rivas") {
  const usuario = await crearUsuario("PRESTADOR", nombre);
  const perfil = await prisma.perfilPrestador.create({
    data: { usuarioId: usuario.id, comunaId: 13101, descripcion: "Jardinero con años de oficio.", telefono: "+56912345678" },
  });
  const servicio = await nuevoServicio(perfil.id, "Mantención de jardines");
  return { ...usuario, perfilId: perfil.id, servicioId: servicio };
}

async function nuevoServicio(prestadorId: string, titulo: string) {
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const servicio = await prisma.servicio.create({
    data: { prestadorId, categoriaId: categoria.id, titulo, descripcion: "Trabajo a domicilio, con materiales incluidos.", estado: "PUBLICADO" },
  });
  return servicio.id;
}

/** Un contacto registrado con ese prestador, por ese servicio. */
async function contactar(clienteId: string, prestador: { perfilId: string }, servicioId: string) {
  return prisma.contacto.create({
    data: { clienteId, prestadorId: prestador.perfilId, servicioId, canal: "WHATSAPP", creadoEn: new Date(Date.now() - DIA_MS) },
  });
}

/** «AAAA-MM-DD» de hoy en Chile, corrido `dias` días. */
function dia(dias = 0): string {
  const hoy = new Date(`${fechaDeHoyEnChile()}T00:00:00Z`);
  return new Date(hoy.getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

function registrar(token: string | null, cuerpo: object) {
  const solicitud = request(app).post("/contrataciones");
  return token ? solicitud.set("Authorization", `Bearer ${token}`).send(cuerpo) : solicitud.send(cuerpo);
}

const listar = (token: string, consulta = "") => request(app).get(`/contrataciones${consulta}`).set("Authorization", `Bearer ${token}`);
const editar = (token: string, id: string, cuerpo: object) =>
  request(app).patch(`/contrataciones/${id}`).set("Authorization", `Bearer ${token}`).send(cuerpo);
const borrar = (token: string, id: string) => request(app).delete(`/contrataciones/${id}`).set("Authorization", `Bearer ${token}`);

/** Un cliente con contacto que ya registró el servicio del prestador. */
async function escenario(notas = "Podó el limonero y dejó todo limpio.") {
  const prestador = await crearPrestador();
  const cliente = await crearCliente();
  await contactar(cliente.id, prestador, prestador.servicioId);
  const respuesta = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-3), notas });
  expect(respuesta.status).toBe(201);
  return { prestador, cliente, id: String(respuesta.body.contratacion.id), notas };
}

describe("POST /contrataciones", () => {
  it("un cliente con contacto registra una contratación: se crea con la copia del título y del nombre del prestador", async () => {
    const prestador = await crearPrestador("Pedro Soto Rivas");
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    const respuesta = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-5), notas: "  Volver en marzo.  " });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.contratacion).toMatchObject({
      fechaContratacion: dia(-5),
      notas: "Volver en marzo.",
      servicio: { id: prestador.servicioId, titulo: "Mantención de jardines", disponible: true },
      prestador: { nombre: "Pedro Soto Rivas" },
      valoracion: null,
    });
    const fila = await prisma.contratacion.findUniqueOrThrow({ where: { id: respuesta.body.contratacion.id } });
    expect(fila).toMatchObject({
      clienteId: cliente.id,
      servicioId: prestador.servicioId,
      prestadorId: prestador.perfilId,
      tituloServicio: "Mantención de jardines",
      nombrePrestador: "Pedro Soto Rivas",
    });
  });

  it("las copias no cambian si después el prestador edita el título", async () => {
    const { prestador, cliente } = await escenario();
    await prisma.servicio.update({ where: { id: prestador.servicioId }, data: { titulo: "Paisajismo integral" } });

    const respuesta = await listar(cliente.token);

    expect(respuesta.body.contrataciones[0].servicio.titulo).toBe("Mantención de jardines");
  });

  it("el cliente, el prestador y las copias salen del servidor: lo que envíe el cliente se ignora", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    const otro = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    const respuesta = await registrar(cliente.token, {
      servicioId: prestador.servicioId,
      fechaContratacion: dia(-1),
      clienteId: otro.id,
      tituloServicio: "Título inventado",
      nombrePrestador: "Nombre inventado",
    });

    expect(respuesta.status).toBe(201);
    const fila = await prisma.contratacion.findUniqueOrThrow({ where: { id: respuesta.body.contratacion.id } });
    expect(fila).toMatchObject({ clienteId: cliente.id, tituloServicio: "Mantención de jardines", nombrePrestador: prestador.nombre });
  });

  it("sin contacto registrado con ese prestador: rechazado y no se crea nada", async () => {
    const prestador = await crearPrestador();
    const otroPrestador = await crearPrestador("Carolina Muñoz");
    const cliente = await crearCliente();
    // Contactó a OTRO prestador: no sirve para este.
    await contactar(cliente.id, otroPrestador, otroPrestador.servicioId);

    const respuesta = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("SIN_CONTACTO");
    expect(await prisma.contratacion.count()).toBe(0);
  });

  it("un contacto por OTRO servicio del mismo prestador sí basta: el contacto es con el prestador", async () => {
    const prestador = await crearPrestador();
    const poda = await nuevoServicio(prestador.perfilId, "Poda de árboles");
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    const respuesta = await registrar(cliente.token, { servicioId: poda, fechaContratacion: dia(-1) });

    expect(respuesta.status).toBe(201);
  });

  it("sin sesión: 401", async () => {
    const prestador = await crearPrestador();

    const respuesta = await registrar(null, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) });

    expect(respuesta.status).toBe(401);
    expect((await request(app).get("/contrataciones")).status).toBe(401);
    expect((await request(app).get(`/contrataciones/servicio/${prestador.servicioId}`)).status).toBe(401);
    expect((await request(app).patch("/contrataciones/x").send({ notas: "hola" })).status).toBe(401);
    expect((await request(app).delete("/contrataciones/x")).status).toBe(401);
  });

  it("un prestador marcando su propio servicio: rechazado, aunque tenga un contacto consigo mismo", async () => {
    const prestador = await crearPrestador();
    await contactar(prestador.id, prestador, prestador.servicioId);

    const respuesta = await registrar(prestador.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe("CONTRATACION_PROPIA");
    expect(await prisma.contratacion.count()).toBe(0);
  });

  it("un prestador que contrató a OTRO prestador sí puede registrarlo", async () => {
    const jardinero = await crearPrestador();
    const gasfiter = await crearPrestador("Jorge Díaz");
    await contactar(gasfiter.id, jardinero, jardinero.servicioId);

    const respuesta = await registrar(gasfiter.token, { servicioId: jardinero.servicioId, fechaContratacion: dia(0) });

    expect(respuesta.status).toBe(201);
  });

  it("un administrador no lleva historial: 403", async () => {
    const prestador = await crearPrestador();
    const admin = await crearUsuario("ADMINISTRADOR");

    expect((await registrar(admin.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) })).status).toBe(403);
    expect((await listar(admin.token)).status).toBe(403);
  });

  it("fecha futura: 400, y la base también la rechaza (CHECK contrataciones_fecha_no_futura)", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    const respuesta = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(1) });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toEqual([{ campo: "fechaContratacion", mensaje: "La fecha no puede ser futura." }]);

    // La base no depende de la API: un INSERT directo con fecha futura falla.
    const manana = dia(1);
    await expect(
      prisma.$executeRaw`
        INSERT INTO contrataciones (id, cliente_id, servicio_id, prestador_id, fecha_contratacion, titulo_servicio, nombre_prestador, actualizado_en)
        VALUES (gen_random_uuid()::text, ${cliente.id}, ${prestador.servicioId}, ${prestador.perfilId}, ${manana}::date, 'Mantención de jardines', 'Pedro', now())`,
    ).rejects.toThrow("contrataciones_fecha_no_futura");
    // Y tampoco deja mover a futuro una existente.
    const { id } = await prisma.contratacion.create({
      data: {
        clienteId: cliente.id,
        servicioId: prestador.servicioId,
        prestadorId: prestador.perfilId,
        fechaContratacion: new Date(`${dia(-1)}T00:00:00Z`),
        tituloServicio: "Mantención de jardines",
        nombrePrestador: "Pedro",
      },
    });
    await expect(prisma.contratacion.update({ where: { id }, data: { fechaContratacion: new Date(`${manana}T00:00:00Z`) } })).rejects.toThrow(
      "contrataciones_fecha_no_futura",
    );
  });

  it("hoy (en Chile) sí se acepta", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    expect((await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(0) })).status).toBe(201);
  });

  it("fechas inválidas y notas de más de 500 caracteres: 400", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    for (const fechaContratacion of ["2026-02-30", "18-11-2026", "1999-12-31", ""]) {
      const respuesta = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion });
      expect(respuesta.status, fechaContratacion).toBe(400);
    }
    const largas = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1), notas: "a".repeat(501) });
    expect(largas.status).toBe(400);
    expect(largas.body.error.detalles[0].campo).toBe("notas");
    expect(await prisma.contratacion.count()).toBe(0);
  });

  it("el mismo servicio registrado dos veces en fechas distintas: ambas se crean; la misma fecha dos veces: 409", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);

    const primera = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-60) });
    const segunda = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-30) });
    const repetida = await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-30) });

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe("CONTRATACION_DUPLICADA");
    expect(await prisma.contratacion.count({ where: { clienteId: cliente.id, servicioId: prestador.servicioId } })).toBe(2);
  });

  it("un servicio que no existe: 404", async () => {
    const cliente = await crearCliente();

    const respuesta = await registrar(cliente.token, { servicioId: "no-existe", fechaContratacion: dia(-1) });

    expect(respuesta.status).toBe(404);
  });
});

describe("GET /contrataciones", () => {
  it("lista solo las propias, de la fecha más reciente a la más antigua, con paginación", async () => {
    const prestador = await crearPrestador();
    const cliente = await crearCliente();
    const otro = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);
    await contactar(otro.id, prestador, prestador.servicioId);
    for (const dias of [-40, -2, -20]) {
      expect((await registrar(cliente.token, { servicioId: prestador.servicioId, fechaContratacion: dia(dias) })).status).toBe(201);
    }
    expect((await registrar(otro.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) })).status).toBe(201);

    const primera = await listar(cliente.token, "?porPagina=2");
    const segunda = await listar(cliente.token, "?porPagina=2&pagina=2");

    expect(primera.status).toBe(200);
    expect(primera.headers["cache-control"]).toBe("no-store");
    expect(primera.body.total).toBe(3);
    expect(primera.body.contrataciones.map((c: { fechaContratacion: string }) => c.fechaContratacion)).toEqual([dia(-2), dia(-20)]);
    expect(segunda.body.contrataciones.map((c: { fechaContratacion: string }) => c.fechaContratacion)).toEqual([dia(-40)]);
  });

  it("dice si ya valoró ese servicio, para enlazar a su valoración", async () => {
    const { prestador, cliente } = await escenario();
    const contacto = await prisma.contacto.findFirstOrThrow({ where: { clienteId: cliente.id } });
    const valoracion = await prisma.valoracion.create({
      data: { contactoId: contacto.id, clienteId: cliente.id, prestadorId: prestador.perfilId, servicioId: prestador.servicioId, calificacion: 5 },
    });

    const respuesta = await listar(cliente.token);

    expect(respuesta.body.contrataciones[0].valoracion).toEqual({ id: valoracion.id });
  });

  it("un parámetro con el id de otro usuario se ignora: siempre devuelve las de la sesión", async () => {
    const { cliente } = await escenario();
    const curioso = await crearCliente();

    const respuesta = await listar(curioso.token, `?clienteId=${cliente.id}&usuarioId=${cliente.id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(0);
    expect(respuesta.body.contrataciones).toEqual([]);
  });
});

describe("GET /contrataciones/servicio/:servicioId", () => {
  it("dice si puede registrar y lo que ya registró de ese servicio", async () => {
    const { prestador, cliente, id } = await escenario();
    const sinContacto = await crearCliente();

    const propio = await request(app).get(`/contrataciones/servicio/${prestador.servicioId}`).set("Authorization", `Bearer ${cliente.token}`);
    const ajeno = await request(app).get(`/contrataciones/servicio/${prestador.servicioId}`).set("Authorization", `Bearer ${sinContacto.token}`);
    const delPrestador = await request(app).get(`/contrataciones/servicio/${prestador.servicioId}`).set("Authorization", `Bearer ${prestador.token}`);

    expect(propio.body).toMatchObject({ puedeRegistrar: true, motivo: null, contrataciones: [{ id }] });
    expect(ajeno.body).toEqual({ puedeRegistrar: false, motivo: "SIN_CONTACTO", contrataciones: [] });
    // El dueño del servicio no ve las de sus clientes: solo que es suyo.
    expect(delPrestador.body).toEqual({ puedeRegistrar: false, motivo: "PROPIO", contrataciones: [] });
  });
});

describe("Privacidad: un prestador no puede ver ninguna contratación", () => {
  it("intentar editar o eliminar la de un cliente sobre su propio servicio: 403, y la fila queda igual", async () => {
    const { prestador, id, notas } = await escenario();

    const edicion = await editar(prestador.token, id, { notas: "Cambiadas por el prestador." });
    const borrado = await borrar(prestador.token, id);

    expect(edicion.status).toBe(403);
    expect(edicion.body.error.codigo).toBe("CONTRATACION_AJENA");
    // La respuesta de error no trae nada del registro.
    expect(JSON.stringify(edicion.body)).not.toContain(notas);
    expect(borrado.status).toBe(403);
    expect(await prisma.contratacion.findUniqueOrThrow({ where: { id } })).toMatchObject({ notas });
  });

  it("su lista propia no incluye las que sus clientes registraron sobre sus servicios", async () => {
    const { prestador } = await escenario();

    const respuesta = await listar(prestador.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(0);
  });

  it("ninguna respuesta que ve el prestador menciona el registro: perfil, servicios, valoraciones ni páginas públicas", async () => {
    const { prestador, id, notas } = await escenario("Nota privada que nadie más debe leer.");
    const conSesion = (ruta: string) => request(app).get(ruta).set("Authorization", `Bearer ${prestador.token}`);

    const rutas = [
      "/auth/yo",
      "/prestadores/yo",
      "/servicios/mios",
      "/prestadores/yo/valoraciones",
      `/servicios/${prestador.servicioId}`,
      `/servicios/${prestador.servicioId}/valoraciones`,
      `/prestadores/${prestador.perfilId}/publico`,
      `/prestadores/${prestador.perfilId}/valoraciones`,
      "/servicios",
    ];

    for (const ruta of rutas) {
      const respuesta = await conSesion(ruta);
      expect(respuesta.status, ruta).toBe(200);
      const texto = JSON.stringify(respuesta.body);
      expect(texto, ruta).not.toContain(id);
      expect(texto, ruta).not.toContain(notas);
      expect(texto.toLowerCase(), ruta).not.toContain("contratacion");
    }
  });

  it("no existe ninguna ruta que las exponga: solo el módulo contrataciones toca la tabla, montado solo en /contrataciones", async () => {
    const raiz = fileURLToPath(new URL("../../src", import.meta.url));
    const archivos: string[] = [];
    async function recorrer(carpeta: string) {
      for (const entrada of await readdir(carpeta, { withFileTypes: true })) {
        const ruta = join(carpeta, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name !== "generated") await recorrer(ruta);
        } else if (entrada.name.endsWith(".ts")) {
          archivos.push(ruta);
        }
      }
    }
    await recorrer(raiz);

    const queTocanLaTabla: string[] = [];
    const queUsanLasRutas: string[] = [];
    for (const archivo of archivos) {
      const codigo = await readFile(archivo, "utf8");
      const nombre = relative(raiz, archivo).replaceAll("\\", "/");
      // Por Prisma (prisma.contratacion / tx.contratacion) o por SQL directo.
      if (/\b(prisma|tx)\.contratacion\b|\b(FROM|JOIN|INTO|UPDATE)\s+"?contrataciones\b/i.test(codigo)) queTocanLaTabla.push(nombre);
      if (codigo.includes("rutasContrataciones")) queUsanLasRutas.push(nombre);
    }

    expect(queTocanLaTabla).toEqual(["modules/contrataciones/contrataciones.repository.ts"]);
    expect(queUsanLasRutas.sort()).toEqual(["app.ts", "modules/contrataciones/contrataciones.routes.ts"]);
    const appTs = await readFile(join(raiz, "app.ts"), "utf8");
    expect(appTs.match(/app\.use\([^)]*rutasContrataciones\)/g)).toEqual(['app.use("/contrataciones", rutasContrataciones)']);
    // Y las rutas del módulo no reciben el id de un usuario: solo el del registro o del servicio.
    const rutas = await readFile(join(raiz, "modules/contrataciones/contrataciones.routes.ts"), "utf8");
    expect(rutas.match(/rutasContrataciones\.\w+\("[^"]*"/g)).toEqual([
      'rutasContrataciones.get("/"',
      'rutasContrataciones.post("/"',
      'rutasContrataciones.get("/servicio/:servicioId"',
      'rutasContrataciones.patch("/:id"',
      'rutasContrataciones.delete("/:id"',
    ]);
  });
});

describe("PATCH y DELETE /contrataciones/:id", () => {
  it("el dueño edita la fecha y las notas", async () => {
    const { cliente, id } = await escenario();

    const respuesta = await editar(cliente.token, id, { fechaContratacion: dia(-10), notas: "Cobró lo acordado." });
    const sinNotas = await editar(cliente.token, id, { notas: "" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.contratacion).toMatchObject({ fechaContratacion: dia(-10), notas: "Cobró lo acordado." });
    expect(sinNotas.body.contratacion.notas).toBeNull();
  });

  it("editar sin fecha ni notas, o con fecha futura: 400", async () => {
    const { cliente, id } = await escenario();

    expect((await editar(cliente.token, id, {})).status).toBe(400);
    expect((await editar(cliente.token, id, { fechaContratacion: dia(2) })).status).toBe(400);
  });

  it("un cliente no puede editar ni eliminar la contratación de otro cliente", async () => {
    const { id, notas } = await escenario();
    const otro = await crearCliente();

    expect((await editar(otro.token, id, { notas: "Ajenas." })).status).toBe(403);
    expect((await borrar(otro.token, id)).status).toBe(403);
    expect(await prisma.contratacion.findUniqueOrThrow({ where: { id } })).toMatchObject({ notas });
  });

  it("el dueño la elimina: 204, y un id que no existe: 404", async () => {
    const { cliente, id } = await escenario();

    expect((await borrar(cliente.token, id)).status).toBe(204);
    expect(await prisma.contratacion.count()).toBe(0);
    expect((await borrar(cliente.token, id)).status).toBe(404);
    expect((await editar(cliente.token, id, { notas: "Hola de nuevo." })).status).toBe(404);
  });
});

describe("El historial sobrevive a la publicación y a la cuenta del prestador", () => {
  it("eliminar el servicio deja el registro visible con el título guardado", async () => {
    const prestador = await crearPrestador();
    // Lo contactó por un servicio y le contrató OTRO, que el prestador después borra.
    const poda = await nuevoServicio(prestador.perfilId, "Poda de árboles altos");
    const cliente = await crearCliente();
    await contactar(cliente.id, prestador, prestador.servicioId);
    expect((await registrar(cliente.token, { servicioId: poda, fechaContratacion: dia(-7) })).status).toBe(201);

    // El registro privado no bloquea el borrado (si lo hiciera, el prestador se enteraría).
    const borrado = await request(app).delete(`/servicios/${poda}`).set("Authorization", `Bearer ${prestador.token}`);
    expect(borrado.status).toBe(204);

    const respuesta = await listar(cliente.token);
    expect(respuesta.body.contrataciones[0]).toMatchObject({
      servicio: { id: null, titulo: "Poda de árboles altos", disponible: false },
      prestador: { nombre: prestador.nombre },
      fechaContratacion: dia(-7),
    });
  });

  it("borrar la cuenta del prestador deja el registro con el título y el nombre copiados", async () => {
    const { prestador, cliente } = await escenario();
    // Hoy la plataforma no borra cuentas con contactos (RESTRICT); se simula
    // el borrado futuro quitando primero ese historial.
    await prisma.contacto.deleteMany({ where: { prestadorId: prestador.perfilId } });
    // La aceptación de términos también es RESTRICT (evidencia de consentimiento).
    await prisma.aceptacionTerminos.deleteMany({ where: { usuarioId: prestador.id } });
    await prisma.usuario.delete({ where: { id: prestador.id } });

    const respuesta = await listar(cliente.token);

    expect(respuesta.body.contrataciones[0]).toMatchObject({
      servicio: { id: null, titulo: "Mantención de jardines", disponible: false },
      prestador: { nombre: "Pedro Soto Rivas" },
    });
    expect(await prisma.contratacion.findFirstOrThrow({ where: { clienteId: cliente.id } })).toMatchObject({ servicioId: null, prestadorId: null });
  });

  it("un servicio pausado sigue en el historial, pero sin página a la que llevar", async () => {
    const { prestador, cliente } = await escenario();
    await prisma.servicio.update({ where: { id: prestador.servicioId }, data: { estado: "PAUSADO" } });

    const respuesta = await listar(cliente.token);

    expect(respuesta.body.contrataciones[0].servicio).toEqual({ id: prestador.servicioId, titulo: "Mantención de jardines", disponible: false });
  });

  it("eliminar la cuenta del cliente elimina sus contrataciones (CASCADE)", async () => {
    const { prestador, cliente } = await escenario();
    const otro = await crearCliente();
    await contactar(otro.id, prestador, prestador.servicioId);
    expect((await registrar(otro.token, { servicioId: prestador.servicioId, fechaContratacion: dia(-1) })).status).toBe(201);
    // Igual que arriba: el contacto es RESTRICT, se quita antes de borrar la cuenta.
    await prisma.contacto.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.aceptacionTerminos.deleteMany({ where: { usuarioId: cliente.id } });

    await prisma.usuario.delete({ where: { id: cliente.id } });

    expect(await prisma.contratacion.count({ where: { clienteId: cliente.id } })).toBe(0);
    // Las de otras personas no se tocan.
    expect(await prisma.contratacion.count({ where: { clienteId: otro.id } })).toBe(1);
  });
});
