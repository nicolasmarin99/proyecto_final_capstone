import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { cargarMaestros } from "../../src/maestros/cargarMaestros.js";

/*
  Estas pruebas no pasan por la API: insertan directo con Prisma para
  demostrar que las reglas las impone la base de datos, aunque el código que
  las respeta tuviera un error o alguien escribiera con otro cliente.

  Cada rechazo se compara con el NOMBRE de la restricción que debe
  dispararlo. Comprobar solo "que falle" dejaría pasar una prueba que falla
  por otra razón (un dato mal armado, una clave foránea inexistente).
*/

const SANTIAGO = 13101;

/** Vacía todo lo que cuelga de usuarios. TRUNCATE porque la bitácora de
 *  credenciales rechaza DELETE, y CASCADE porque casi todo depende de usuarios. */
async function vaciar() {
  await prisma.$executeRaw`TRUNCATE usuarios CASCADE`;
}

beforeAll(async () => {
  await cargarMaestros(prisma);
});

beforeEach(vaciar);

// Los demás archivos limpian con usuario.deleteMany(): si quedaran filas con
// RESTRICT hacia usuarios, su limpieza fallaría.
afterAll(vaciar);

let secuencia = 0;

async function crearUsuario(rol: "CLIENTE" | "PRESTADOR" | "ADMINISTRADOR" = "CLIENTE") {
  secuencia += 1;
  return prisma.usuario.create({
    data: { correo: `persona${secuencia}@ejemplo.cl`, nombre: `Persona ${secuencia}`, rol },
  });
}

async function crearPrestador(radioAtencionKm = 30) {
  const usuario = await crearUsuario("PRESTADOR");
  return prisma.perfilPrestador.create({
    data: { usuarioId: usuario.id, comunaId: SANTIAGO, radioAtencionKm },
  });
}

async function crearContacto(clienteId: string, prestadorId: string) {
  return prisma.contacto.create({ data: { clienteId, prestadorId, canal: "WHATSAPP" } });
}

async function categoria(slug: string) {
  return prisma.categoria.findUniqueOrThrow({ where: { slug } });
}

async function tipoCredencial(codigo: string) {
  return prisma.tipoCredencial.findUniqueOrThrow({ where: { codigo } });
}

describe("valoraciones", () => {
  it("rechaza una segunda valoración del mismo cliente al mismo prestador", async () => {
    const cliente = await crearUsuario();
    const prestador = await crearPrestador();
    // Dos contactos distintos: el UNIQUE por contacto no alcanza a frenar
    // esto, tiene que hacerlo el UNIQUE por par cliente-prestador.
    const primero = await crearContacto(cliente.id, prestador.id);
    const segundo = await crearContacto(cliente.id, prestador.id);

    await prisma.valoracion.create({
      data: { contactoId: primero.id, clienteId: cliente.id, prestadorId: prestador.id, calificacion: 5 },
    });

    await expect(
      prisma.valoracion.create({
        data: { contactoId: segundo.id, clienteId: cliente.id, prestadorId: prestador.id, calificacion: 4 },
      }),
    ).rejects.toThrow("valoraciones_cliente_id_prestador_id_key");
  });

  it.each([0, 6])("rechaza una calificación de %i", async (calificacion) => {
    const cliente = await crearUsuario();
    const prestador = await crearPrestador();
    const contacto = await crearContacto(cliente.id, prestador.id);

    await expect(
      prisma.valoracion.create({
        data: { contactoId: contacto.id, clienteId: cliente.id, prestadorId: prestador.id, calificacion },
      }),
    ).rejects.toThrow("valoraciones_calificacion_1_a_5");
  });

  it("rechaza una valoración cuyo prestador no es el del contacto", async () => {
    const cliente = await crearUsuario();
    const prestador = await crearPrestador();
    const otroPrestador = await crearPrestador();
    const contacto = await crearContacto(cliente.id, prestador.id);

    await expect(
      prisma.valoracion.create({
        data: { contactoId: contacto.id, clienteId: cliente.id, prestadorId: otroPrestador.id, calificacion: 5 },
      }),
    ).rejects.toThrow("valoraciones_contacto_id_cliente_id_prestador_id_fkey");
  });
});

describe("denuncias", () => {
  async function prepararObjetos() {
    const denunciante = await crearUsuario();
    const denunciado = await crearUsuario();
    const prestador = await crearPrestador();
    const servicio = await prisma.servicio.create({
      data: {
        prestadorId: prestador.id,
        categoriaId: (await categoria("gasfiteria")).id,
        titulo: "Gasfitería a domicilio",
        descripcion: "Reparaciones",
      },
    });
    return { denunciante, denunciado, servicio };
  }

  it("rechaza una denuncia que apunta a dos objetos", async () => {
    const { denunciante, denunciado, servicio } = await prepararObjetos();

    await expect(
      prisma.denuncia.create({
        data: {
          denuncianteId: denunciante.id,
          motivo: "FRAUDE",
          servicioId: servicio.id,
          usuarioDenunciadoId: denunciado.id,
        },
      }),
    ).rejects.toThrow("denuncias_exactamente_un_objeto");
  });

  it("rechaza una denuncia que no apunta a ningún objeto", async () => {
    const { denunciante } = await prepararObjetos();

    await expect(
      prisma.denuncia.create({ data: { denuncianteId: denunciante.id, motivo: "SPAM" } }),
    ).rejects.toThrow("denuncias_exactamente_un_objeto");
  });

  it("acepta una denuncia con exactamente un objeto", async () => {
    // Control: sin esta prueba, las dos anteriores pasarían también si el
    // CHECK rechazara todas las denuncias.
    const { denunciante, servicio } = await prepararObjetos();

    const denuncia = await prisma.denuncia.create({
      data: { denuncianteId: denunciante.id, motivo: "FRAUDE", servicioId: servicio.id },
    });

    expect(denuncia.estado).toBe("ABIERTA");
  });
});

describe("credenciales", () => {
  async function verificada(prestadorId: string, tipoId: string, identificadorDocumento: string) {
    return prisma.credencial.create({
      data: {
        prestadorId,
        tipoId,
        identificadorDocumento,
        estado: "VERIFICADA",
        metodo: "AUTOMATICO",
        fuente: "https://www.sec.cl",
        fechaConsulta: new Date(),
        vigenteHasta: new Date("2027-12-31"),
      },
    });
  }

  it("rechaza dos credenciales verificadas y vigentes del mismo tipo", async () => {
    const prestador = await crearPrestador();
    const sec = await tipoCredencial("SEC_INSTALADOR_ELECTRICO");

    await verificada(prestador.id, sec.id, "SEC-001");

    await expect(verificada(prestador.id, sec.id, "SEC-002")).rejects.toThrow(
      "credenciales_una_verificada_por_tipo",
    );
  });

  it("permite una pendiente del mismo tipo junto a la verificada (renovación)", async () => {
    const prestador = await crearPrestador();
    const sec = await tipoCredencial("SEC_INSTALADOR_ELECTRICO");
    await verificada(prestador.id, sec.id, "SEC-001");

    const renovacion = await prisma.credencial.create({
      data: { prestadorId: prestador.id, tipoId: sec.id, identificadorDocumento: "SEC-002" },
    });

    expect(renovacion.estado).toBe("PENDIENTE");
  });

  it("la bitácora de una credencial no se puede modificar", async () => {
    const prestador = await crearPrestador();
    const sec = await tipoCredencial("SEC_INSTALADOR_ELECTRICO");
    const credencial = await verificada(prestador.id, sec.id, "SEC-001");
    const evento = await prisma.eventoCredencial.create({
      data: { credencialId: credencial.id, estadoNuevo: "VERIFICADA" },
    });

    await expect(
      prisma.eventoCredencial.update({ where: { id: evento.id }, data: { motivo: "editado" } }),
    ).rejects.toThrow("solo admite inserciones");
  });

  it("no deja borrar a un prestador con credenciales: hay que anonimizarlo", async () => {
    const prestador = await crearPrestador();
    const sec = await tipoCredencial("SEC_INSTALADOR_ELECTRICO");
    await verificada(prestador.id, sec.id, "SEC-001");

    await expect(prisma.usuario.delete({ where: { id: prestador.usuarioId } })).rejects.toThrow(
      "credenciales_prestador_id_fkey",
    );
  });
});

describe("búsqueda por cercanía (PostGIS)", () => {
  async function ubicar(prestadorId: string, latitud: number, longitud: number) {
    // ST_MakePoint recibe (longitud, latitud): x antes que y.
    await prisma.$executeRaw`
      UPDATE perfiles_prestador
      SET ubicacion = ST_SetSRID(ST_MakePoint(${longitud}, ${latitud}), 4326)::geography
      WHERE id = ${prestadorId}`;
  }

  it("devuelve a quienes atienden el punto, del más cercano al más lejano", async () => {
    const providencia = await crearPrestador(30);
    const maipu = await crearPrestador(30);
    const puenteAltoCerca = await crearPrestador(30);
    // Está a ~20 km, pero solo atiende hasta 5 km: no debe aparecer.
    const puenteAltoLejos = await crearPrestador(5);

    // Ubicaciones aproximadas de las plazas de cada comuna.
    await ubicar(maipu.id, -33.511, -70.758);
    await ubicar(puenteAltoCerca.id, -33.6117, -70.5758);
    await ubicar(providencia.id, -33.4254, -70.6114);
    await ubicar(puenteAltoLejos.id, -33.6117, -70.5758);

    // Desde la Plaza de Armas de Santiago.
    const latitud = -33.4378;
    const longitud = -70.6505;

    const resultados = await prisma.$queryRaw<{ id: string; metros: number }[]>`
      SELECT p.id, ST_Distance(p.ubicacion, origen.punto) AS metros
      FROM perfiles_prestador p,
           (SELECT ST_SetSRID(ST_MakePoint(${longitud}, ${latitud}), 4326)::geography AS punto) AS origen
      WHERE p.ubicacion IS NOT NULL
        AND ST_DWithin(p.ubicacion, origen.punto, p.radio_atencion_km * 1000)
      ORDER BY metros`;

    expect(resultados.map((r) => r.id)).toEqual([providencia.id, maipu.id, puenteAltoCerca.id]);

    // Distancias plausibles: geography mide en metros sobre el elipsoide.
    const [aProvidencia, aMaipu, aPuenteAlto] = resultados.map((r) => r.metros / 1000);
    expect(aProvidencia).toBeGreaterThan(3);
    expect(aProvidencia).toBeLessThan(5);
    expect(aMaipu).toBeGreaterThan(11);
    expect(aMaipu).toBeLessThan(15);
    expect(aPuenteAlto).toBeGreaterThan(18);
    expect(aPuenteAlto).toBeLessThan(23);
  });
});

describe("búsqueda de texto en español", () => {
  /**
   * Arma una consulta que busca cada palabra como prefijo ("gasfiter:*").
   * Hace falta porque el stemmer reduce "gasfitería" a "gasfiteri" y
   * "gasfiter" a "gasfit": sin prefijo no coinciden. Solo deja letras y
   * números, así que el texto del usuario no puede inyectar operadores de
   * tsquery (&, |, !, :).
   */
  function consultaPorPrefijos(texto: string): string {
    return texto
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((palabra) => `${palabra}:*`)
      .join(" & ");
  }

  async function buscar(texto: string) {
    const consulta = consultaPorPrefijos(texto);
    return prisma.$queryRaw<{ titulo: string }[]>`
      SELECT titulo FROM servicios
      WHERE busqueda @@ to_tsquery('espanol_sin_tildes', ${consulta})
      ORDER BY ts_rank(busqueda, to_tsquery('espanol_sin_tildes', ${consulta})) DESC`;
  }

  beforeEach(async () => {
    const prestador = await crearPrestador();
    await prisma.servicio.createMany({
      data: [
        {
          prestadorId: prestador.id,
          categoriaId: (await categoria("gasfiteria")).id,
          titulo: "Gasfitería a domicilio",
          descripcion: "Reparación de calefont, filtraciones y destapes.",
        },
        {
          prestadorId: prestador.id,
          categoriaId: (await categoria("electricidad")).id,
          titulo: "Electricista certificado SEC",
          descripcion: "Tableros, enchufes y luminarias.",
        },
      ],
    });
  });

  it('"gasfiter" encuentra "Gasfitería a domicilio"', async () => {
    expect(await buscar("gasfiter")).toEqual([{ titulo: "Gasfitería a domicilio" }]);
  });

  it("no distingue tildes ni mayúsculas", async () => {
    expect(await buscar("GASFITERIA")).toEqual([{ titulo: "Gasfitería a domicilio" }]);
    expect(await buscar("reparacion calefont")).toEqual([{ titulo: "Gasfitería a domicilio" }]);
  });

  it("no mezcla rubros", async () => {
    expect(await buscar("electricista")).toEqual([{ titulo: "Electricista certificado SEC" }]);
  });

  it("la columna se recalcula sola al editar el servicio", async () => {
    const servicio = await prisma.servicio.findFirstOrThrow({ where: { titulo: "Gasfitería a domicilio" } });
    await prisma.servicio.update({ where: { id: servicio.id }, data: { titulo: "Cerrajería urgente" } });

    expect(await buscar("gasfiter")).toEqual([]);
    expect(await buscar("cerrajero")).toEqual([{ titulo: "Cerrajería urgente" }]);
  });
});

describe("datos maestros", () => {
  it("cargarlos dos veces no duplica nada", async () => {
    await cargarMaestros(prisma);

    expect(await prisma.region.count()).toBe(16);
    expect(await prisma.comuna.count()).toBe(346);
    expect(await prisma.comuna.count({ where: { regionId: 13 } })).toBe(52);
    expect(await prisma.comuna.count({ where: { regionId: 16 } })).toBe(21);
    expect(await prisma.categoria.count()).toBe(6);
    expect(await prisma.tipoCredencial.count()).toBe(6);
    expect(await prisma.versionTerminos.count()).toBe(1);
  });
});
