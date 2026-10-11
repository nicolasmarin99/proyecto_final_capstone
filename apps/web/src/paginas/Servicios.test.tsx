import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { AreaPrestador } from "../componentes/AreaPrestador";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaEditorServicio from "./mi/EditorServicio";
import PaginaMiPerfil from "./mi/MiPerfil";
import PaginaMisServicios from "./mi/MisServicios";
import PaginaPerfil from "./Perfil";
import PaginaServicio from "./Servicio";

const cliente = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true };
const prestador = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };

const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };
const LAS_CONDES = { id: 13114, nombre: "Las Condes", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };

interface ServicioDePrueba {
  id: string;
  titulo: string;
  descripcion: string;
  precioDesde: number | null;
  precioHasta: number | null;
  unidadPrecio: string | null;
  categoria: { slug: string; nombre: string };
  categoriaPersonalizada?: string | null;
  prestador: {
    id: string;
    nombre: string;
    comunas: { id: number; nombre: string; region: string }[];
    credenciales: { tipo: string; emisor: string; verificadaEn: string; acreditacion: string }[];
  };
}

const SERVICIO_PUBLICO: ServicioDePrueba = {
  id: "s1",
  titulo: "Gasfitería a domicilio",
  descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
  precioDesde: 25000,
  precioHasta: 60000,
  unidadPrecio: "POR_SERVICIO",
  categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
  prestador: {
    id: "perfil-1",
    nombre: "Pedro Soto",
    comunas: [
      { id: 13114, nombre: "Las Condes", region: "Metropolitana de Santiago" },
      { id: 13101, nombre: "Santiago", region: "Metropolitana de Santiago" },
    ],
    credenciales: [
      {
        tipo: "Instalador de gas autorizado (SEC)",
        emisor: "Superintendencia de Electricidad y Combustibles",
        verificadaEn: "2026-10-01T12:00:00.000Z",
        acreditacion: "REGISTRO_OFICIAL",
      },
      {
        tipo: "Cédula de identidad",
        emisor: "Servicio de Registro Civil e Identificación",
        verificadaEn: "2026-10-02T12:00:00.000Z",
        acreditacion: "REVISADA_POR_LOCALCL",
      },
    ],
  },
};

function servicioPropio(estado: string, extra: object = {}) {
  return {
    id: "s1",
    titulo: "Gasfitería a domicilio",
    descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
    precioDesde: null,
    precioHasta: null,
    unidadPrecio: null,
    estado,
    categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
    ...extra,
  };
}

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof cliente | typeof prestador | null;
  servicioPublico?: ServicioDePrueba | null;
  misServicios?: ReturnType<typeof servicioPropio>[];
  requisitos?: { codigo: string; mensaje: string }[];
  respuestaGuardar?: Response;
  respuestaEliminar?: Response;
}

function simularApi({
  usuario = prestador,
  servicioPublico = SERVICIO_PUBLICO,
  misServicios = [],
  requisitos = [],
  respuestaGuardar,
  respuestaEliminar,
}: Escenario = {}) {
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/comunas") return json({ comunas: [LAS_CONDES, SANTIAGO] });
    if (url === "/api/categorias") {
      return json({
        categorias: [
          { slug: "gasfiteria", nombre: "Gasfitería" },
          { slug: "electricidad", nombre: "Electricidad" },
          { slug: "otros", nombre: "Otros" },
        ],
      });
    }
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/prestadores/yo/comunas") return json({ comunas: [LAS_CONDES, SANTIAGO] });
    if (url === "/api/prestadores/yo") {
      return json({
        perfil: {
          id: "perfil-1",
          descripcion: "Gasfíter con experiencia en la zona oriente.",
          telefono: "+56912345678",
          radioAtencionKm: 15,
          comuna: SANTIAGO,
          comunasAtencion: [SANTIAGO],
        },
      });
    }
    if (url === "/api/servicios/mios") return json({ servicios: misServicios, requisitosPendientes: requisitos });
    if (url === "/api/servicios" && metodo === "POST") {
      return respuestaGuardar ?? json({ servicio: servicioPropio("PUBLICADO"), requisitosPendientes: [] }, 201);
    }
    if (/^\/api\/servicios\/[^/]+$/.test(url) && metodo === "PUT") {
      return respuestaGuardar ?? json({ servicio: servicioPropio("PAUSADO"), requisitosPendientes: [] });
    }
    if (/^\/api\/servicios\/[^/]+$/.test(url) && metodo === "DELETE") {
      return respuestaEliminar ?? ({ ok: true, status: 204, json: async () => null } as Response);
    }
    if (/^\/api\/servicios\/[^/]+$/.test(url)) {
      return servicioPublico
        ? json({ servicio: servicioPublico })
        : json({ error: { codigo: "SERVICIO_NO_ENCONTRADO", mensaje: "Ese servicio no existe o no está publicado." } }, 404);
    }
    if (/\/contacto\?servicio=/.test(url)) return json({ telefono: "+56912345678" });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function cuerpoDe(metodo: string, patron: RegExp): unknown {
  const llamada = llamadas(metodo, patron)[0];
  return llamada ? JSON.parse(String(llamada[1]?.body)) : undefined;
}

function renderizar(ruta: string, api: ClienteApi = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={api}>
        <Routes>
          <Route path="/servicios/:id" element={<PaginaServicio cliente={api} />} />
          <Route path="/iniciar-sesion" element={<p>Pantalla de inicio de sesión</p>} />
          <Route path="/perfil" element={<RutaProtegida><PaginaPerfil cliente={api} /></RutaProtegida>} />
          <Route path="/mi" element={<RutaProtegida roles={["PRESTADOR"]}><AreaPrestador /></RutaProtegida>}>
            <Route path="perfil" element={<PaginaMiPerfil />} />
            <Route path="servicios" element={<PaginaMisServicios />} />
            <Route path="servicios/nuevo" element={<PaginaEditorServicio />} />
            <Route path="servicios/:id/editar" element={<PaginaEditorServicio />} />
          </Route>
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

/** Contenido de la página del área, una vez que muestra su título. */
async function pagina(titulo: string) {
  await screen.findByRole("heading", { level: 1, name: titulo });
  return screen.getByRole("main");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Página pública del servicio", () => {
  it("muestra el servicio, el prestador, sus comunas y el precio", async () => {
    simularApi({ usuario: null });
    renderizar("/servicios/s1");

    expect(await screen.findByRole("heading", { level: 1, name: "Gasfitería a domicilio" })).toBeInTheDocument();
    expect(screen.getByText("Pedro Soto")).toBeInTheDocument();
    expect(screen.getByText(/\$25\.000.*\$60\.000/)).toBeInTheDocument();
    const comunas = screen.getByRole("list", { name: /comunas donde atiende/i });
    expect(within(comunas).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Las Condes", "Santiago"]);
  });

  it("con «Otros» muestra el oficio que escribió el prestador, no «Otros»", async () => {
    simularApi({
      usuario: null,
      servicioPublico: {
        ...SERVICIO_PUBLICO,
        categoria: { slug: "otros", nombre: "Otros" },
        categoriaPersonalizada: "Pintura de interiores",
      },
    });
    renderizar("/servicios/s1");

    expect(await screen.findByText("Pintura de interiores")).toBeInTheDocument();
    expect(screen.queryByText(/^otros$/i)).not.toBeInTheDocument();
  });

  it("sin precio muestra «a convenir»", async () => {
    simularApi({ usuario: null, servicioPublico: { ...SERVICIO_PUBLICO, precioDesde: null, precioHasta: null, unidadPrecio: null } });
    renderizar("/servicios/s1");

    expect(await screen.findByText(/a convenir/i)).toBeInTheDocument();
  });

  it("distingue lo acreditado con el registro oficial de lo revisado por LocalCL", async () => {
    simularApi({ usuario: null });
    renderizar("/servicios/s1");

    const credenciales = await screen.findByRole("list", { name: /credenciales verificadas/i });
    const [sec, cedula] = within(credenciales).getAllByRole("listitem");
    expect(sec).toHaveTextContent(/instalador de gas/i);
    expect(sec).toHaveTextContent(/registro oficial/i);
    expect(cedula).toHaveTextContent(/cédula de identidad/i);
    expect(cedula).toHaveTextContent(/revisad[oa] por LocalCL/i);
  });

  it("sin sesión no muestra el botón de WhatsApp y pide iniciar sesión", async () => {
    simularApi({ usuario: null });
    renderizar("/servicios/s1");

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /inicia sesión/i })).toHaveAttribute("href", "/iniciar-sesion");
  });

  it("con sesión: registra el contacto y después abre wa.me con un mensaje sobre el servicio", async () => {
    simularApi({ usuario: cliente });
    const ventana = { location: { href: "" }, opener: {}, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(ventana as unknown as Window);
    renderizar("/servicios/s1");

    fireEvent.click(await screen.findByRole("button", { name: /contactar por whatsapp/i }));

    await waitFor(() => expect(ventana.location.href).toMatch(/^https:\/\/wa\.me\/56912345678\?text=/));
    expect(llamadas("GET", /\/api\/prestadores\/perfil-1\/contacto\?servicio=s1$/)).toHaveLength(1);
    expect(decodeURIComponent(ventana.location.href)).toContain("Gasfitería a domicilio");
    // La pestaña nueva no puede manipular la de LocalCL.
    expect(ventana.opener).toBeNull();
  });

  it("si la API rechaza el contacto, cierra la pestaña y explica por qué", async () => {
    simularApi({ usuario: prestador });
    const ventana = { location: { href: "" }, opener: {}, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(ventana as unknown as Window);
    const original = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (entrada, opciones) =>
      /\/contacto\?/.test(String(entrada))
        ? json({ error: { codigo: "AUTOCONTACTO", mensaje: "No puedes contactarte a ti mismo." } }, 400)
        : (original?.(entrada, opciones) ?? json({}, 500)),
    );
    renderizar("/servicios/s1");

    fireEvent.click(await screen.findByRole("button", { name: /contactar por whatsapp/i }));

    expect(await screen.findByText("No puedes contactarte a ti mismo.")).toBeInTheDocument();
    expect(ventana.close).toHaveBeenCalled();
    expect(ventana.location.href).toBe("");
  });

  it("un servicio que no existe o está pausado: lo dice", async () => {
    simularApi({ usuario: null, servicioPublico: null });
    renderizar("/servicios/no-existe");

    expect(await screen.findByText(/no existe o no está publicado/i)).toBeInTheDocument();
  });
});

describe("Comunas de atención y servicios del prestador", () => {
  it("agrega una comuna de atención y guarda la lista completa", async () => {
    simularApi();
    renderizar("/mi/perfil");

    const seccion = await screen.findByRole("region", { name: /comunas donde atiendes/i });
    await within(seccion).findByRole("button", { name: /quitar santiago/i });
    fireEvent.change(within(seccion).getByLabelText(/agregar comuna/i), { target: { value: "13114" } });
    fireEvent.click(within(seccion).getByRole("button", { name: /^agregar$/i }));
    fireEvent.click(within(seccion).getByRole("button", { name: /guardar comunas/i }));

    // Se mandan todas las elegidas; el orden no importa a la API.
    await waitFor(() => expect(llamadas("PUT", /\/api\/prestadores\/yo\/comunas$/)).toHaveLength(1));
    const { comunaIds } = cuerpoDe("PUT", /\/api\/prestadores\/yo\/comunas$/) as { comunaIds: number[] };
    expect([...comunaIds].sort()).toEqual([13101, 13114]);
    expect(await within(seccion).findByText(/comunas guardadas/i)).toBeInTheDocument();
  });

  it("avisa qué le falta para que sus servicios se publiquen", async () => {
    simularApi({
      requisitos: [{ codigo: "IDENTIDAD_NO_VERIFICADA", mensaje: "Verifica tu identidad: sube tu cédula desde tu perfil de prestador." }],
    });
    renderizar("/mi/servicios");

    const seccion = await pagina("Mis servicios");
    expect(await within(seccion).findByText(/verifica tu identidad: sube tu cédula/i)).toBeInTheDocument();
  });

  it("crea un servicio; antes de enviar advierte que quedará pausado, y al volver dice por qué", async () => {
    const sinComunas = { codigo: "SIN_COMUNAS_ATENCION", mensaje: "Indica al menos una comuna donde atiendes." };
    simularApi({
      requisitos: [sinComunas],
      respuestaGuardar: json({ servicio: servicioPropio("PAUSADO"), requisitosPendientes: [sinComunas] }, 201),
    });
    renderizar("/mi/servicios");

    // El enlace aparece cuando se sabe que tiene perfil.
    fireEvent.click(await within(await pagina("Mis servicios")).findByRole("link", { name: "Publicar servicio" }));
    const formulario = await pagina("Publicar servicio");
    await within(formulario).findByRole("option", { name: "Gasfitería" });

    // El aviso está antes de enviar: qué falta y que se guardará pausado.
    expect(await within(formulario).findByText(/indica al menos una comuna/i)).toBeInTheDocument();
    expect(within(formulario).getByText(/quedará pausado/i)).toBeInTheDocument();

    fireEvent.change(within(formulario).getByLabelText(/categoría/i), { target: { value: "gasfiteria" } });
    fireEvent.change(within(formulario).getByLabelText(/^título/i), { target: { value: "Gasfitería a domicilio" } });
    fireEvent.change(within(formulario).getByLabelText(/descripción del servicio/i), {
      target: { value: "Reparación de calefont, filtraciones y destapes en toda la comuna." },
    });
    fireEvent.change(within(formulario).getByLabelText(/precio desde/i), { target: { value: "25000" } });
    fireEvent.change(within(formulario).getByLabelText(/cómo cobras/i), { target: { value: "POR_HORA" } });
    fireEvent.click(within(formulario).getByRole("button", { name: /guardar servicio/i }));

    // De vuelta en la lista, con la confirmación y lo que falta.
    const lista = await pagina("Mis servicios");
    expect(await within(lista).findByText(/quedó pausado/i)).toBeInTheDocument();
    expect(await within(lista).findByText(/indica al menos una comuna/i)).toBeInTheDocument();
    expect(cuerpoDe("POST", /\/api\/servicios$/)).toEqual({
      categoria: "gasfiteria",
      categoriaPersonalizada: null,
      titulo: "Gasfitería a domicilio",
      descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
      precioDesde: 25000,
      precioHasta: null,
      unidadPrecio: "POR_HORA",
      estado: "PUBLICADO",
    });
  });

  it("con «Otros» pide el nombre del oficio y lo envía; con otra categoría el campo desaparece", async () => {
    simularApi();
    renderizar("/mi/servicios/nuevo");
    const seccion = await pagina("Publicar servicio");

    await within(seccion).findByRole("option", { name: "Otros" });
    expect(within(seccion).queryByLabelText(/nombre de tu oficio/i)).not.toBeInTheDocument();

    fireEvent.change(within(seccion).getByLabelText(/categoría/i), { target: { value: "gasfiteria" } });
    expect(within(seccion).queryByLabelText(/nombre de tu oficio/i)).not.toBeInTheDocument();

    fireEvent.change(within(seccion).getByLabelText(/categoría/i), { target: { value: "otros" } });
    fireEvent.change(within(seccion).getByLabelText(/nombre de tu oficio/i), { target: { value: "Pintura de interiores" } });
    fireEvent.change(within(seccion).getByLabelText(/^título/i), { target: { value: "Pintura de departamentos y casas" } });
    fireEvent.change(within(seccion).getByLabelText(/descripción del servicio/i), {
      target: { value: "Pintura interior, reparación de grietas y empaste. Materiales incluidos." },
    });
    fireEvent.click(within(seccion).getByRole("button", { name: /guardar servicio/i }));

    await waitFor(() =>
      expect(cuerpoDe("POST", /\/api\/servicios$/)).toMatchObject({
        categoria: "otros",
        categoriaPersonalizada: "Pintura de interiores",
      }),
    );
  });

  it("con «Otros» y sin nombre del oficio, no envía", async () => {
    simularApi();
    renderizar("/mi/servicios/nuevo");
    const seccion = await pagina("Publicar servicio");

    await within(seccion).findByRole("option", { name: "Otros" });
    fireEvent.change(within(seccion).getByLabelText(/categoría/i), { target: { value: "otros" } });
    fireEvent.change(within(seccion).getByLabelText(/^título/i), { target: { value: "Pintura de departamentos y casas" } });
    fireEvent.change(within(seccion).getByLabelText(/descripción del servicio/i), {
      target: { value: "Pintura interior, reparación de grietas y empaste. Materiales incluidos." },
    });
    fireEvent.click(within(seccion).getByRole("button", { name: /guardar servicio/i }));

    const campo = within(seccion).getByLabelText(/nombre de tu oficio/i);
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(llamadas("POST", /\/api\/servicios$/)).toHaveLength(0);
  });

  it("valida antes de enviar: título corto y precio hasta menor que desde", async () => {
    simularApi();
    renderizar("/mi/servicios/nuevo");
    const seccion = await pagina("Publicar servicio");

    await within(seccion).findByRole("option", { name: "Gasfitería" });
    fireEvent.change(within(seccion).getByLabelText(/categoría/i), { target: { value: "gasfiteria" } });
    fireEvent.change(within(seccion).getByLabelText(/^título/i), { target: { value: "Gasfíter" } });
    fireEvent.change(within(seccion).getByLabelText(/precio desde/i), { target: { value: "60000" } });
    fireEvent.change(within(seccion).getByLabelText(/precio hasta/i), { target: { value: "25000" } });
    fireEvent.click(within(seccion).getByRole("button", { name: /guardar servicio/i }));

    expect(await within(seccion).findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/no puede ser menor que el precio desde/i)).toBeInTheDocument();
    expect(llamadas("POST", /\/api\/servicios$/)).toHaveLength(0);
  });

  it("edita un servicio en su propia página, con sus datos cargados", async () => {
    simularApi({ misServicios: [servicioPropio("PUBLICADO")] });
    renderizar("/mi/servicios");
    const fila = await screen.findByRole("article", { name: /gasfitería a domicilio/i });

    expect(within(fila).getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/mi/servicios/s1/editar");
    fireEvent.click(within(fila).getByRole("link", { name: "Editar" }));

    const seccion = await pagina("Editar servicio");
    await waitFor(() => expect(within(seccion).getByLabelText(/^título/i)).toHaveValue("Gasfitería a domicilio"));
    fireEvent.click(within(seccion).getByRole("button", { name: /guardar servicio/i }));

    await waitFor(() => expect(llamadas("PUT", /\/api\/servicios\/s1$/)).toHaveLength(1));
    expect(await screen.findByRole("heading", { level: 1, name: "Mis servicios" })).toBeInTheDocument();
  });

  it("pausa un servicio publicado", async () => {
    simularApi({ misServicios: [servicioPropio("PUBLICADO")] });
    renderizar("/mi/servicios");
    const fila = await screen.findByRole("article", { name: /gasfitería a domicilio/i });

    fireEvent.click(within(fila).getByRole("button", { name: /^pausar$/i }));

    await waitFor(() => expect(cuerpoDe("PUT", /\/api\/servicios\/s1$/)).toMatchObject({ estado: "PAUSADO" }));
  });

  it("si no se puede eliminar porque tiene contactos, lo explica", async () => {
    simularApi({
      misServicios: [servicioPropio("PUBLICADO")],
      respuestaEliminar: json(
        { error: { codigo: "SERVICIO_CON_CONTACTOS", mensaje: "Este servicio ya tiene contactos registrados, así que no se puede eliminar." } },
        409,
      ),
    });
    renderizar("/mi/servicios");
    const fila = await screen.findByRole("article", { name: /gasfitería a domicilio/i });

    fireEvent.click(within(fila).getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(within(fila).getByRole("button", { name: /sí, eliminar/i }));

    expect(await within(fila).findByText(/ya tiene contactos registrados/i)).toBeInTheDocument();
    expect(llamadas("DELETE", /\/api\/servicios\/s1$/)).toHaveLength(1);
  });

  it("en /perfil, con un servicio publicado el último paso queda listo", async () => {
    simularApi({ misServicios: [servicioPropio("PUBLICADO")] });
    renderizar("/perfil");

    const lista = await screen.findByRole("list", { name: /para aparecer en las búsquedas/i });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")[2]).toHaveTextContent(/listo/i));
  });
});
