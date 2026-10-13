import { Algorithm, hash } from "@node-rs/argon2";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import type { Rol } from "../../src/generated/prisma/client.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";
import { AlmacenamientoPublicoEnMemoria, obtenerAlmacenamientoPublico } from "../../src/modules/almacenamiento/index.js";
import { jpgConExif, pdfMinimo, pngConTexto, webpConExif } from "../archivos.js";

const CONTRASENA = "contrasena-segura-123";
const SANTIAGO = 13101;

function almacenamiento(): AlmacenamientoPublicoEnMemoria {
  const actual = obtenerAlmacenamientoPublico();
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

async function crearUsuario(rol: Rol, opciones: { correoVerificado?: boolean } = {}) {
  secuencia += 1;
  const correo = `persona${secuencia}@ejemplo.cl`;
  const usuario = await prisma.usuario.create({
    data: {
      correo,
      nombre: `Persona ${secuencia}`,
      rol,
      rut: rol === "PRESTADOR" ? `${30000000 + secuencia}-K` : null,
      rutVerificado: rol === "PRESTADOR",
      correoVerificado: opciones.correoVerificado ?? true,
      hashContrasena: await hash(CONTRASENA, { algorithm: Algorithm.Argon2id }),
    },
  });
  const login = await request(app).post("/auth/login").send({ correo, contrasena: CONTRASENA });
  expect(login.status).toBe(200);
  return { ...usuario, token: String(login.body.accessToken) };
}

/** Prestador con perfil y un servicio PUBLICADO, listo para recibir imágenes. */
async function crearPrestadorConServicio(opciones: { correoVerificado?: boolean; titulo?: string } = {}) {
  const usuario = await crearUsuario("PRESTADOR", opciones);
  const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "gasfiteria" } });
  const perfil = await prisma.perfilPrestador.create({
    data: {
      usuarioId: usuario.id,
      comunaId: SANTIAGO,
      telefono: "+56912345678",
      descripcion: "Gasfíter con experiencia en la zona.",
      comunasAtencion: { create: [{ comunaId: SANTIAGO }] },
    },
  });
  const servicio = await prisma.servicio.create({
    data: {
      prestadorId: perfil.id,
      categoriaId: categoria.id,
      titulo: opciones.titulo ?? "Gasfitería a domicilio",
      descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
      estado: "PUBLICADO",
    },
  });
  return { ...usuario, servicioId: servicio.id };
}

function subir(token: string, servicioId: string, contenido: Buffer, nombre = "foto.jpg", tipo = "image/jpeg") {
  return request(app)
    .post(`/servicios/${servicioId}/imagenes`)
    .set("Authorization", `Bearer ${token}`)
    .attach("imagen", contenido, { filename: nombre, contentType: tipo });
}

async function filasDe(servicioId: string) {
  return prisma.imagenServicio.findMany({ where: { servicioId }, orderBy: { orden: "asc" } });
}

describe("POST /servicios/:id/imagenes", () => {
  it("sube una imagen válida: queda asociada al servicio y VISIBLE", async () => {
    const prestador = await crearPrestadorConServicio();

    const respuesta = await subir(prestador.token, prestador.servicioId, jpgConExif(), "casa-de-don-pedro.jpg");

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.imagen).toMatchObject({ estado: "VISIBLE", orden: 0, motivoOcultamiento: null });
    const [fila] = await filasDe(prestador.servicioId);
    expect(fila).toMatchObject({ estado: "VISIBLE", orden: 0 });
    expect(almacenamiento().existe(String(fila?.identificador))).toBe(true);
    // El nombre lo genera el servidor: el del cliente no se guarda en ningún lado.
    expect(fila?.identificador).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(fila)).not.toContain("casa-de-don-pedro");
    expect(respuesta.body.imagen.url).toContain(String(fila?.identificador));
  });

  it.each([
    ["un texto renombrado a .jpg", Buffer.from("<html><script>alert(1)</script></html>"), "foto.jpg", "image/jpeg"],
    ["un PDF (vale para la cédula, no para una foto)", pdfMinimo(), "foto.pdf", "application/pdf"],
    ["un JPEG con la firma pero sin estructura", Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), "foto.jpg", "image/jpeg"],
  ])("rechaza con 400 %s", async (_caso, contenido, nombre, tipo) => {
    const prestador = await crearPrestadorConServicio();

    const respuesta = await subir(prestador.token, prestador.servicioId, contenido, nombre, tipo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles[0].campo).toBe("imagen");
    expect(almacenamiento().cantidad).toBe(0);
    expect(await filasDe(prestador.servicioId)).toHaveLength(0);
  });

  it("rechaza con 400 una imagen de más de 5 MB", async () => {
    const prestador = await crearPrestadorConServicio();
    const grande = Buffer.concat([jpgConExif(), Buffer.alloc(5 * 1024 * 1024)]);

    const respuesta = await subir(prestador.token, prestador.servicioId, grande);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles[0]).toEqual({ campo: "imagen", mensaje: "La imagen supera los 5 MB." });
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("la sexta imagen recibe 409 y no llega al almacenamiento", async () => {
    const prestador = await crearPrestadorConServicio();
    for (let i = 0; i < 5; i += 1) {
      expect((await subir(prestador.token, prestador.servicioId, jpgConExif())).status).toBe(201);
    }

    const respuesta = await subir(prestador.token, prestador.servicioId, jpgConExif());

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe("LIMITE_IMAGENES");
    expect(almacenamiento().cantidad).toBe(5);
    expect((await filasDe(prestador.servicioId)).map((fila) => fila.orden)).toEqual([0, 1, 2, 3, 4]);
  });

  it("dos subidas simultáneas con una sola plaza libre no dejan seis imágenes", async () => {
    const prestador = await crearPrestadorConServicio();
    for (let i = 0; i < 4; i += 1) await subir(prestador.token, prestador.servicioId, jpgConExif());

    const estados = (
      await Promise.all([subir(prestador.token, prestador.servicioId, jpgConExif()), subir(prestador.token, prestador.servicioId, jpgConExif())])
    ).map((respuesta) => respuesta.status);

    expect(estados.sort()).toEqual([201, 409]);
    expect(await filasDe(prestador.servicioId)).toHaveLength(5);
    // La que no entró se borró del proveedor: no quedan archivos huérfanos.
    expect(almacenamiento().cantidad).toBe(5);
  });

  it("un prestador no puede subir a un servicio de otro: 403", async () => {
    const dueno = await crearPrestadorConServicio();
    const otro = await crearPrestadorConServicio();

    const respuesta = await subir(otro.token, dueno.servicioId, jpgConExif());

    expect(respuesta.status).toBe(403);
    expect(almacenamiento().cantidad).toBe(0);
  });

  it("un cliente no puede subir (403), sin sesión es 401 y un servicio inexistente es 404", async () => {
    const dueno = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");

    expect((await subir(cliente.token, dueno.servicioId, jpgConExif())).status).toBe(403);
    expect((await request(app).post(`/servicios/${dueno.servicioId}/imagenes`).attach("imagen", jpgConExif(), "a.jpg")).status).toBe(401);
    expect((await subir(dueno.token, "no-existe", jpgConExif())).status).toBe(404);
  });

  it("exige el correo confirmado", async () => {
    const prestador = await crearPrestadorConServicio({ correoVerificado: false });

    expect((await subir(prestador.token, prestador.servicioId, jpgConExif())).status).toBe(403);
  });
});

describe("Metadatos", () => {
  it.each([
    ["JPG", jpgConExif(), "image/jpeg", "Exif"],
    ["PNG", pngConTexto(), "image/png", "Autor: Persona Real"],
    ["WEBP", webpConExif(), "image/webp", "Exif"],
  ])("el EXIF de un %s no llega al almacenamiento", async (_formato, original, tipo, marca) => {
    const prestador = await crearPrestadorConServicio();
    expect(original.includes(Buffer.from(marca, "latin1"))).toBe(true);

    const respuesta = await subir(prestador.token, prestador.servicioId, original, "foto", tipo);

    expect(respuesta.status).toBe(201);
    const [fila] = await filasDe(prestador.servicioId);
    // Se revisa el archivo que recibió el adaptador, no lo que dice la API.
    const guardado = almacenamiento().contenido(String(fila?.identificador));
    expect(guardado).not.toBeNull();
    expect(guardado?.includes(Buffer.from("GPS-SECRETO", "latin1"))).toBe(false);
    expect(guardado?.includes(Buffer.from(marca, "latin1"))).toBe(false);
    expect(almacenamiento().tipoMime(String(fila?.identificador))).toBe(tipo);
  });

  it("en un WEBP también apaga las banderas que anunciaban EXIF y XMP", async () => {
    const prestador = await crearPrestadorConServicio();

    await subir(prestador.token, prestador.servicioId, webpConExif(), "foto.webp", "image/webp");

    const [fila] = await filasDe(prestador.servicioId);
    const guardado = almacenamiento().contenido(String(fila?.identificador)) ?? Buffer.alloc(0);
    expect(guardado.toString("latin1", 0, 4)).toBe("RIFF");
    expect(guardado.readUInt32LE(4)).toBe(guardado.length - 8);
    expect(guardado.toString("latin1", 12, 16)).toBe("VP8X");
    expect((guardado[20] ?? 0) & 0x0c).toBe(0);
    expect(guardado.includes(Buffer.from("DATOS-DE-IMAGEN", "latin1"))).toBe(true);
  });
});

describe("DELETE /servicios/:id/imagenes/:imagenId", () => {
  it("borra la imagen del proveedor y de la base, y reordena las que quedan", async () => {
    const prestador = await crearPrestadorConServicio();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id);
    const [, medio] = await filasDe(prestador.servicioId);

    const respuesta = await request(app)
      .delete(`/servicios/${prestador.servicioId}/imagenes/${ids[1]}`)
      .set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(204);
    expect(almacenamiento().existe(String(medio?.identificador))).toBe(false);
    const restantes = await filasDe(prestador.servicioId);
    expect(restantes.map((fila) => [fila.id, fila.orden])).toEqual([
      [ids[0], 0],
      [ids[2], 1],
    ]);
  });

  it("solo el dueño puede borrar: 403 para otro prestador, 404 para una imagen de otro servicio", async () => {
    const dueno = await crearPrestadorConServicio();
    const otro = await crearPrestadorConServicio();
    const imagenId = (await subir(dueno.token, dueno.servicioId, jpgConExif())).body.imagen.id;

    const ajena = await request(app).delete(`/servicios/${dueno.servicioId}/imagenes/${imagenId}`).set("Authorization", `Bearer ${otro.token}`);
    const cruzada = await request(app).delete(`/servicios/${otro.servicioId}/imagenes/${imagenId}`).set("Authorization", `Bearer ${otro.token}`);

    expect(ajena.status).toBe(403);
    expect(cruzada.status).toBe(404);
    expect(almacenamiento().cantidad).toBe(1);
  });

  it("al eliminar el servicio, sus archivos también se borran del proveedor", async () => {
    const prestador = await crearPrestadorConServicio();
    await subir(prestador.token, prestador.servicioId, jpgConExif());
    await subir(prestador.token, prestador.servicioId, pngConTexto(), "b.png", "image/png");

    const respuesta = await request(app).delete(`/servicios/${prestador.servicioId}`).set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(204);
    expect(almacenamiento().cantidad).toBe(0);
    expect(await prisma.imagenServicio.count()).toBe(0);
  });
});

describe("PUT /servicios/:id/imagenes/orden", () => {
  it("reordena según la lista recibida", async () => {
    const prestador = await crearPrestadorConServicio();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id);
    const nuevo = [ids[2], ids[0], ids[1]];

    const respuesta = await request(app)
      .put(`/servicios/${prestador.servicioId}/imagenes/orden`)
      .set("Authorization", `Bearer ${prestador.token}`)
      .send({ imagenes: nuevo });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.imagenes.map((imagen: { id: string }) => imagen.id)).toEqual(nuevo);
    expect((await filasDe(prestador.servicioId)).map((fila) => fila.id)).toEqual(nuevo);
  });

  it.each([
    ["le falta una", (ids: string[]) => ids.slice(0, 1)],
    ["trae una de otro servicio", (ids: string[]) => [ids[0], "otra"]],
    ["repite una", (ids: string[]) => [ids[0], ids[0]]],
  ])("rechaza con 400 un orden que %s", async (_caso, armar) => {
    const prestador = await crearPrestadorConServicio();
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) ids.push((await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id);

    const respuesta = await request(app)
      .put(`/servicios/${prestador.servicioId}/imagenes/orden`)
      .set("Authorization", `Bearer ${prestador.token}`)
      .send({ imagenes: armar(ids) });

    expect(respuesta.status).toBe(400);
    expect((await filasDe(prestador.servicioId)).map((fila) => fila.id)).toEqual(ids);
  });
});

describe("Moderación: PATCH /admin/imagenes/:id/ocultar", () => {
  async function ocultar(token: string, imagenId: string, motivo = "La foto muestra la dirección de un cliente.") {
    return request(app).patch(`/admin/imagenes/${imagenId}/ocultar`).set("Authorization", `Bearer ${token}`).send({ motivo });
  }

  it("un administrador la oculta con motivo y queda registrado en la bitácora quién, cuándo y por qué", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;
    const { identificador } = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagenId } });

    const respuesta = await ocultar(admin.token, imagenId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.imagen).toMatchObject({ estado: "OCULTA", motivoOcultamiento: "La foto muestra la dirección de un cliente." });
    const [registro, ...otros] = await prisma.moderacionImagen.findMany({ where: { imagenId } });
    expect(otros).toHaveLength(0);
    expect(registro).toMatchObject({
      servicioId: prestador.servicioId,
      imagenId,
      identificadorArchivo: identificador,
      motivo: "La foto muestra la dirección de un cliente.",
      administradorId: admin.id,
    });
    expect(registro?.creadoEn).toBeInstanceOf(Date);
    expect((await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagenId } })).estado).toBe("OCULTA");
    // El archivo se borra del proveedor: una URL guardada deja de funcionar.
    expect(almacenamiento().existe(identificador)).toBe(false);
    // El dueño la sigue viendo en su lista, con el motivo, pero sin direcciones: ya no hay archivo.
    const mios = await request(app).get("/servicios/mios").set("Authorization", `Bearer ${prestador.token}`);
    expect(mios.body.servicios[0].imagenes[0]).toMatchObject({
      estado: "OCULTA",
      motivoOcultamiento: expect.stringContaining("dirección"),
      url: null,
      miniatura: null,
    });
  });

  it("al ocultar llama a eliminar del adaptador con el archivo de esa imagen", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;
    const { identificador } = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagenId } });
    const eliminar = vi.spyOn(almacenamiento(), "eliminar");

    const respuesta = await ocultar(admin.token, imagenId, "La foto muestra la patente del auto del cliente.");

    expect(respuesta.status).toBe(200);
    expect(eliminar).toHaveBeenCalledTimes(1);
    expect(eliminar).toHaveBeenCalledWith(identificador);
    expect(respuesta.body.imagen).toMatchObject({ estado: "OCULTA", url: null, miniatura: null });
  });

  it("si el proveedor no confirma el borrado, no oculta nada: 502, sigue VISIBLE, con su archivo y sin registro", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagen = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen;
    const { identificador } = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagen.id } });
    vi.spyOn(almacenamiento(), "eliminar").mockRejectedValueOnce(new Error("Cloudinary no confirmó la eliminación."));

    const fallida = await ocultar(admin.token, imagen.id);

    expect(fallida.status).toBe(502);
    expect(fallida.body.error.codigo).toBe("ALMACENAMIENTO_NO_DISPONIBLE");
    // Nada a medias: la fila se revirtió, la bitácora no registra una moderación
    // que no ocurrió y el archivo sigue ahí.
    expect((await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagen.id } })).estado).toBe("VISIBLE");
    expect(await prisma.moderacionImagen.count({ where: { imagenId: imagen.id } })).toBe(0);
    expect(almacenamiento().existe(identificador)).toBe(true);
    expect((await request(app).get(`/servicios/${prestador.servicioId}`)).body.servicio.imagenes).toHaveLength(1);

    // El reintento funciona.
    const reintento = await ocultar(admin.token, imagen.id);
    expect(reintento.status).toBe(200);
    expect(almacenamiento().existe(identificador)).toBe(false);
    expect(await prisma.moderacionImagen.count({ where: { imagenId: imagen.id } })).toBe(1);
  });

  it("la bitácora de moderación solo admite inserciones", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;
    await ocultar(admin.token, imagenId);
    const registro = await prisma.moderacionImagen.findFirstOrThrow({ where: { imagenId } });

    await expect(prisma.moderacionImagen.update({ where: { id: registro.id }, data: { motivo: "Otro motivo cualquiera." } })).rejects.toThrow(
      /solo admite inserciones/,
    );
    await expect(prisma.moderacionImagen.delete({ where: { id: registro.id } })).rejects.toThrow(/solo admite inserciones/);
    expect(await prisma.moderacionImagen.findUniqueOrThrow({ where: { id: registro.id } })).toMatchObject({ motivo: registro.motivo });
  });

  it("el orden se fija con las visibles; las ocultas quedan al final", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id);
    await ocultar(admin.token, String(ids[0]));

    const respuesta = await request(app)
      .put(`/servicios/${prestador.servicioId}/imagenes/orden`)
      .set("Authorization", `Bearer ${prestador.token}`)
      .send({ imagenes: [ids[2], ids[1]] });

    expect(respuesta.status).toBe(200);
    expect((await filasDe(prestador.servicioId)).map((fila) => fila.id)).toEqual([ids[2], ids[1], ids[0]]);
    // Incluir la oculta en el orden es un error: no se reordena lo que no se muestra.
    const conOculta = await request(app)
      .put(`/servicios/${prestador.servicioId}/imagenes/orden`)
      .set("Authorization", `Bearer ${prestador.token}`)
      .send({ imagenes: [ids[0], ids[1], ids[2]] });
    expect(conOculta.status).toBe(400);
  });

  it("una imagen oculta ocupa cupo hasta que el prestador la elimina", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id);
    await ocultar(admin.token, String(ids[0]));

    expect((await subir(prestador.token, prestador.servicioId, jpgConExif())).status).toBe(409);

    await request(app).delete(`/servicios/${prestador.servicioId}/imagenes/${ids[0]}`).set("Authorization", `Bearer ${prestador.token}`);

    expect((await subir(prestador.token, prestador.servicioId, jpgConExif())).status).toBe(201);
  });

  it("el prestador puede eliminar una imagen oculta y la evidencia se conserva", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;
    await ocultar(admin.token, imagenId);
    const eliminar = vi.spyOn(almacenamiento(), "eliminar");

    const respuesta = await request(app)
      .delete(`/servicios/${prestador.servicioId}/imagenes/${imagenId}`)
      .set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(204);
    expect(await prisma.imagenServicio.count({ where: { id: imagenId } })).toBe(0);
    // Su archivo ya se había borrado al ocultarla: no se vuelve a llamar al proveedor.
    expect(eliminar).not.toHaveBeenCalled();
    expect(await prisma.moderacionImagen.findFirst({ where: { imagenId } })).toMatchObject({
      servicioId: prestador.servicioId,
      administradorId: admin.id,
      motivo: "La foto muestra la dirección de un cliente.",
    });
  });

  it("el prestador puede eliminar un servicio que tuvo imágenes moderadas, y la evidencia se conserva", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const oculta = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;
    await subir(prestador.token, prestador.servicioId, jpgConExif());
    await ocultar(admin.token, oculta);

    const respuesta = await request(app).delete(`/servicios/${prestador.servicioId}`).set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(204);
    expect(await prisma.servicio.count({ where: { id: prestador.servicioId } })).toBe(0);
    expect(await prisma.imagenServicio.count({ where: { servicioId: prestador.servicioId } })).toBe(0);
    // La foto visible también se borró del proveedor.
    expect(almacenamiento().cantidad).toBe(0);
    expect(await prisma.moderacionImagen.findMany({ where: { servicioId: prestador.servicioId } })).toEqual([
      expect.objectContaining({ imagenId: oculta, administradorId: admin.id, motivo: "La foto muestra la dirección de un cliente." }),
    ]);
  });

  it("un prestador (ni siquiera el dueño) ni un cliente pueden ocultar: 403", async () => {
    const prestador = await crearPrestadorConServicio();
    const cliente = await crearUsuario("CLIENTE");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;

    expect((await ocultar(prestador.token, imagenId)).status).toBe(403);
    expect((await ocultar(cliente.token, imagenId)).status).toBe(403);
    expect((await prisma.imagenServicio.findUniqueOrThrow({ where: { id: imagenId } })).estado).toBe("VISIBLE");
  });

  it("exige un motivo; ocultar dos veces es 409 y una imagen inexistente es 404", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const imagenId = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen.id;

    expect((await ocultar(admin.token, imagenId, "corto")).status).toBe(400);
    expect((await ocultar(admin.token, imagenId)).status).toBe(200);
    expect((await ocultar(admin.token, imagenId)).status).toBe(409);
    expect((await ocultar(admin.token, "no-existe")).status).toBe(404);
  });

  it("el administrador lista las imágenes con su servicio y prestador", async () => {
    const prestador = await crearPrestadorConServicio({ titulo: "Gasfitería con fotos" });
    const admin = await crearUsuario("ADMINISTRADOR");
    await subir(prestador.token, prestador.servicioId, jpgConExif());

    const respuesta = await request(app).get("/admin/imagenes").set("Authorization", `Bearer ${admin.token}`);
    const comoPrestador = await request(app).get("/admin/imagenes").set("Authorization", `Bearer ${prestador.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.imagenes[0]).toMatchObject({
      estado: "VISIBLE",
      servicio: { id: prestador.servicioId, titulo: "Gasfitería con fotos", prestador: prestador.nombre },
    });
    expect(comoPrestador.status).toBe(403);
  });
});

describe("Imágenes en la página pública y en la búsqueda", () => {
  it("la página pública trae las visibles en orden; una OCULTA no aparece ni ahí ni en la búsqueda", async () => {
    const prestador = await crearPrestadorConServicio();
    const admin = await crearUsuario("ADMINISTRADOR");
    const primera = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen;
    const segunda = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen;

    const { identificador } = await prisma.imagenServicio.findUniqueOrThrow({ where: { id: primera.id } });
    await request(app)
      .patch(`/admin/imagenes/${primera.id}/ocultar`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ motivo: "Se ve el número de la casa del cliente." });
    expect(almacenamiento().existe(identificador)).toBe(false);

    const publica = await request(app).get(`/servicios/${prestador.servicioId}`);
    expect(publica.status).toBe(200);
    expect(publica.body.servicio.imagenes).toEqual([{ id: segunda.id, url: segunda.url, miniatura: segunda.miniatura }]);
    expect(JSON.stringify(publica.body)).not.toContain(primera.id);

    const busqueda = await request(app).get("/servicios").query({ q: "gasfiteria" });
    // La miniatura pasa a ser la primera visible.
    expect(busqueda.body.resultados[0].imagen).toBe(segunda.miniatura);
    expect(JSON.stringify(busqueda.body)).not.toContain(primera.miniatura);
  });

  it("en la búsqueda solo va la primera imagen, como miniatura", async () => {
    const prestador = await crearPrestadorConServicio();
    const primera = (await subir(prestador.token, prestador.servicioId, jpgConExif())).body.imagen;
    await subir(prestador.token, prestador.servicioId, jpgConExif());

    const busqueda = await request(app).get("/servicios");

    expect(busqueda.body.resultados[0].imagen).toBe(primera.miniatura);
    expect(busqueda.body.resultados[0].imagen).toContain("/miniatura/");
    expect(busqueda.body.resultados[0]).not.toHaveProperty("imagenes");
  });

  it("un servicio sin imágenes sigue apareciendo normal en la búsqueda y en su página", async () => {
    const prestador = await crearPrestadorConServicio({ titulo: "Gasfitería sin fotos" });

    const busqueda = await request(app).get("/servicios").query({ q: "gasfiteria" });
    const publica = await request(app).get(`/servicios/${prestador.servicioId}`);

    expect(busqueda.status).toBe(200);
    expect(busqueda.body.resultados).toHaveLength(1);
    expect(busqueda.body.resultados[0]).toMatchObject({ titulo: "Gasfitería sin fotos", imagen: null });
    expect(publica.status).toBe(200);
    expect(publica.body.servicio.imagenes).toEqual([]);
  });
});
