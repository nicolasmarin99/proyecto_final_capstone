import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { AreaPrestador } from "../componentes/AreaPrestador";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaAdmin from "./Admin";
import PaginaPrestador from "./Prestador";
import PaginaMisCertificaciones from "./mi/MisCertificaciones";

const prestador = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const admin = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Admin", rol: "ADMINISTRADOR", correoVerificado: true };

const COMUNA = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };
const PERFIL = {
  id: "perfil-1",
  descripcion: "Gasfíter con 10 años de experiencia en calefont.",
  telefono: "+56912345678",
  radioAtencionKm: 15,
  comuna: COMUNA,
};

const TIPOS = [
  { codigo: "SEC_INSTALADOR_GAS", nombre: "Instalador de gas autorizado (SEC)", emisor: "Superintendencia de Electricidad y Combustibles", requiereVigencia: true },
  { codigo: "OTRA", nombre: "Otra certificación", emisor: "Indicado por el prestador", requiereVigencia: false },
  { codigo: "CURSO", nombre: "Curso", emisor: "Institución indicada por el prestador", requiereVigencia: false },
];

function certificacion(estado: string, extra: object = {}) {
  return {
    id: "c1",
    clase: "CERTIFICACION",
    tipo: "SEC_INSTALADOR_GAS",
    nombre: "Instalador de gas autorizado (SEC)",
    emisor: "Superintendencia de Electricidad y Combustibles",
    identificador: "SEC-2024-001",
    vigenteHasta: "2030-12-31T00:00:00.000Z",
    fechaTermino: null,
    horas: null,
    estado,
    motivoRechazo: null,
    enviadaEn: "2026-10-10T12:00:00.000Z",
    revisadaEn: null,
    ...extra,
  };
}

const PRESTADOR_PUBLICO = {
  id: "perfil-1",
  nombre: "Pedro Soto",
  descripcion: "Gasfíter con 10 años de experiencia en calefont.",
  comunas: [{ id: 13101, nombre: "Santiago", region: "Metropolitana de Santiago" }],
  conCertificaciones: true,
  certificaciones: [
    {
      nombre: "Instalador de gas autorizado (SEC)",
      emisor: "Superintendencia de Electricidad y Combustibles",
      verificadaEn: "2026-10-11T12:00:00.000Z",
      vigenteHasta: "2030-12-31T00:00:00.000Z",
      acreditacion: "REVISADA_POR_LOCALCL",
    },
  ],
  cursos: [
    {
      nombre: "Instalaciones eléctricas domiciliarias",
      institucion: "INACAP",
      fechaTermino: "2025-03-15T00:00:00.000Z",
      horas: 120,
      verificadaEn: "2026-10-12T12:00:00.000Z",
    },
  ],
  servicios: [
    {
      id: "s1",
      titulo: "Reparación de calefont",
      categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
      categoriaPersonalizada: null,
      precioDesde: 25000,
      precioHasta: null,
      unidadPrecio: "POR_SERVICIO",
      imagen: null,
    },
  ],
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof prestador | typeof admin | null;
  propias?: ReturnType<typeof certificacion>[];
  respuestaSubida?: Response;
  cola?: ReturnType<typeof certificacion>[];
  publico?: Response;
  tipos?: typeof TIPOS;
}

function simularApi({ usuario = prestador, propias = [], respuestaSubida, cola = [], publico, tipos = TIPOS }: Escenario = {}) {
  const resueltas = new Set<string>();

  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/prestadores/yo") return json({ perfil: PERFIL });
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/servicios/mios") return json({ servicios: [], requisitosPendientes: [] });
    if (url === "/api/certificaciones/tipos") return json({ tipos });
    if (url === "/api/prestadores/yo/certificaciones" && metodo === "POST") {
      return respuestaSubida ?? json({ certificacion: certificacion("PENDIENTE", { id: "nueva" }) }, 201);
    }
    if (url === "/api/prestadores/yo/certificaciones") return json({ certificaciones: propias });
    if (url === "/api/prestadores/perfil-1/publico") return publico ?? json({ prestador: PRESTADOR_PUBLICO });
    if (url === "/api/admin/resumen") {
      return json({ resumen: { totalUsuarios: 2, porRol: { CLIENTE: 0, PRESTADOR: 1, ADMINISTRADOR: 1 } } });
    }
    if (url.startsWith("/api/admin/identidades?")) return json({ identidades: [], pagina: 1, porPagina: 10, total: 0 });
    if (url.startsWith("/api/admin/reportes")) return json({ servicios: [], pagina: 1, porPagina: 10, total: 0 });
    if (url.startsWith("/api/admin/certificaciones?")) {
      const quedan = cola.filter((fila) => !resueltas.has(fila.id));
      return json({
        certificaciones: quedan.map((fila) => ({ ...fila, prestador: { id: "perfil-1", nombre: "Pedro Soto", rut: "123456785" } })),
        pagina: 1,
        porPagina: 10,
        total: quedan.length,
      });
    }
    if (/\/api\/admin\/certificaciones\/[^/]+\/documento$/.test(url)) {
      return json({ url: "https://api.cloudinary.com/firmada/c.jpg", expiraEn: "2026-10-10T12:05:00.000Z" });
    }
    const decision = /\/api\/admin\/certificaciones\/([^/]+)\/(aprobar|rechazar)$/.exec(url);
    if (decision?.[1]) {
      resueltas.add(decision[1]);
      return json({ certificacion: certificacion(decision[2] === "aprobar" ? "VERIFICADA" : "RECHAZADA") });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar(ruta: string, cliente: ClienteApi = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/mi" element={<RutaProtegida roles={["PRESTADOR"]}><AreaPrestador /></RutaProtegida>}>
            <Route path="certificaciones" element={<PaginaMisCertificaciones />} />
          </Route>
          <Route path="/prestadores/:id" element={<PaginaPrestador cliente={cliente} />} />
          <Route path="/admin" element={<RutaProtegida><PaginaAdmin cliente={cliente} /></RutaProtegida>} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function archivo(nombre = "certificado.jpg", tipo = "image/jpeg") {
  return new File([new Uint8Array(1024)], nombre, { type: tipo });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Certificaciones del prestador (/mi/certificaciones)", () => {
  it("aparece en la navegación del área", async () => {
    simularApi({ propias: [certificacion("VERIFICADA")] });
    renderizar("/mi/certificaciones");

    const enlaces = await screen.findAllByRole("link", { name: /certificaciones/i });
    expect(enlaces[0]).toHaveAttribute("href", "/mi/certificaciones");
    expect(await screen.findAllByText("1 aprobada")).not.toHaveLength(0);
  });

  it("envía el formulario con el documento como multipart y la muestra en revisión", async () => {
    simularApi();
    renderizar("/mi/certificaciones");

    fireEvent.change(await screen.findByLabelText("Tipo de certificación"), { target: { value: "SEC_INSTALADOR_GAS" } });
    fireEvent.change(screen.getByLabelText("Número, folio o código"), { target: { value: "SEC-2024-001" } });
    fireEvent.change(screen.getByLabelText("Vigente hasta"), { target: { value: "2030-12-31" } });
    fireEvent.change(screen.getByLabelText(/documento que la acredita/i), { target: { files: [archivo()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/un administrador la revisará/i);
    const lista = screen.getByRole("list", { name: "Mis certificaciones y cursos" });
    expect(within(lista).getByText("En revisión")).toBeInTheDocument();

    const [llamada] = llamadas("POST", /\/api\/prestadores\/yo\/certificaciones$/);
    const cuerpo = llamada?.[1]?.body;
    expect(cuerpo).toBeInstanceOf(FormData);
    const formulario = cuerpo as FormData;
    expect(formulario.get("tipo")).toBe("SEC_INSTALADOR_GAS");
    expect(formulario.get("identificador")).toBe("SEC-2024-001");
    expect(formulario.get("vigenteHasta")).toBe("2030-12-31");
    expect(formulario.get("documento")).toBeInstanceOf(File);
    // El estado lo fija el servidor: el formulario nunca lo envía.
    expect(formulario.has("estado")).toBe(false);
    expect(formulario.has("nombre")).toBe(false);
  });

  it("con «Otra certificación» pide nombre y emisor, y avisa antes de enviar", async () => {
    simularApi();
    renderizar("/mi/certificaciones");

    fireEvent.change(await screen.findByLabelText("Tipo de certificación"), { target: { value: "OTRA" } });
    expect(screen.getByLabelText("Vigente hasta (opcional)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    await waitFor(() => expect(screen.getByLabelText("Nombre de la certificación")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Quién la emite")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/documento que la acredita/i)).toHaveAccessibleDescription(/adjunta la foto/i);
    expect(llamadas("POST", /certificaciones$/)).toHaveLength(0);
  });

  it("un tipo que vence exige la fecha de vigencia", async () => {
    simularApi();
    renderizar("/mi/certificaciones");

    fireEvent.change(await screen.findByLabelText("Tipo de certificación"), { target: { value: "SEC_INSTALADOR_GAS" } });
    fireEvent.change(screen.getByLabelText("Número, folio o código"), { target: { value: "SEC-1" } });
    fireEvent.change(screen.getByLabelText(/documento que la acredita/i), { target: { files: [archivo()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    await waitFor(() => expect(screen.getByLabelText("Vigente hasta")).toHaveAccessibleDescription(/indica hasta cuándo/i));
    expect(llamadas("POST", /certificaciones$/)).toHaveLength(0);
  });

  it("muestra el error de la API bajo el campo que corresponde", async () => {
    simularApi({
      respuestaSubida: json(
        { error: { codigo: "DATOS_INVALIDOS", mensaje: "Los datos enviados no son válidos.", detalles: [{ campo: "documento", mensaje: "El archivo parece dañado." }] } },
        400,
      ),
    });
    renderizar("/mi/certificaciones");

    fireEvent.change(await screen.findByLabelText("Tipo de certificación"), { target: { value: "OTRA" } });
    fireEvent.change(screen.getByLabelText("Nombre de la certificación"), { target: { value: "Técnico en climatización" } });
    fireEvent.change(screen.getByLabelText("Quién la emite"), { target: { value: "INACAP" } });
    fireEvent.change(screen.getByLabelText("Número, folio o código"), { target: { value: "INACAP-77" } });
    fireEvent.change(screen.getByLabelText(/documento que la acredita/i), { target: { files: [archivo()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    await waitFor(() => expect(screen.getByLabelText(/documento que la acredita/i)).toHaveAccessibleDescription("El archivo parece dañado."));
  });

  it("una rechazada muestra el motivo", async () => {
    simularApi({ propias: [certificacion("RECHAZADA", { motivoRechazo: "El folio no coincide con el registro de la SEC." })] });
    renderizar("/mi/certificaciones");

    const lista = await screen.findByRole("list", { name: "Mis certificaciones y cursos" });
    expect(within(lista).getByText("Rechazada")).toBeInTheDocument();
    expect(within(lista).getByText(/el folio no coincide/i)).toBeInTheDocument();
  });
});

describe("Cola de certificaciones del administrador", () => {
  it("muestra lo declarado, pide el documento a demanda y aprueba", async () => {
    simularApi({ usuario: admin, cola: [certificacion("PENDIENTE")] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Certificaciones y cursos" });
    const solicitud = await within(seccion).findByRole("article", { name: "Instalador de gas autorizado (SEC)" });
    expect(within(solicitud).getByText("SEC-2024-001")).toBeInTheDocument();
    expect(within(solicitud).getByText("12.345.678-5")).toBeInTheDocument();
    expect(llamadas("GET", /certificaciones\/c1\/documento$/)).toHaveLength(0);

    fireEvent.click(within(solicitud).getByRole("button", { name: "Ver documento" }));
    expect(await within(solicitud).findByRole("img")).toHaveAttribute("src", "https://api.cloudinary.com/firmada/c.jpg");

    fireEvent.click(within(solicitud).getByRole("button", { name: "Aprobar" }));
    expect(await within(seccion).findByRole("status")).toHaveTextContent(/aprobada\. el documento fue eliminado/i);
    expect(llamadas("PATCH", /\/api\/admin\/certificaciones\/c1\/aprobar$/)).toHaveLength(1);
    expect(await within(seccion).findByText(/no hay certificaciones ni cursos pendientes/i)).toBeInTheDocument();
  });

  it("rechazar exige un motivo y lo envía", async () => {
    simularApi({ usuario: admin, cola: [certificacion("PENDIENTE")] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Certificaciones y cursos" });
    fireEvent.click(await within(seccion).findByRole("button", { name: "Rechazar" }));
    fireEvent.click(within(seccion).getByRole("button", { name: "Confirmar rechazo" }));
    expect(await within(seccion).findByText(/indica el motivo del rechazo/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /rechazar$/)).toHaveLength(0);

    fireEvent.change(within(seccion).getByLabelText("Motivo del rechazo"), { target: { value: "El folio no coincide con el registro." } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Confirmar rechazo" }));

    await waitFor(() => expect(llamadas("PATCH", /\/api\/admin\/certificaciones\/c1\/rechazar$/)).toHaveLength(1));
    const [llamada] = llamadas("PATCH", /rechazar$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ motivo: "El folio no coincide con el registro." });
  });
});

describe("Perfil público del prestador (/prestadores/:id)", () => {
  it("sin sesión muestra el sello, «Ver certificaciones», sus certificaciones y sus servicios", async () => {
    simularApi({ usuario: null });
    renderizar("/prestadores/perfil-1");

    expect(await screen.findByRole("heading", { level: 1, name: "Pedro Soto" })).toBeInTheDocument();
    expect(screen.getByText("Prestador con certificaciones")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver certificaciones" })).toHaveAttribute("href", "#certificaciones");

    const lista = screen.getByRole("list", { name: "Certificaciones" });
    expect(within(lista).getByText("Instalador de gas autorizado (SEC)")).toBeInTheDocument();
    expect(within(lista).getByText(/vigente hasta el 31 de diciembre de 2030/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reparación de calefont/i })).toHaveAttribute("href", "/servicios/s1");
    // Nunca el teléfono: para contactarlo se entra a un servicio.
    expect(document.body).not.toHaveTextContent("+56912345678");
  });

  it("sin certificaciones no hay sello", async () => {
    simularApi({ usuario: null, publico: json({ prestador: { ...PRESTADOR_PUBLICO, conCertificaciones: false, certificaciones: [] } }) });
    renderizar("/prestadores/perfil-1");

    expect(await screen.findByText(/todavía no tiene certificaciones aprobadas/i)).toBeInTheDocument();
    expect(screen.queryByText("Prestador con certificaciones")).not.toBeInTheDocument();
  });

  it("404: dice que no existe o no tiene servicios publicados", async () => {
    simularApi({ usuario: null, publico: json({ error: { codigo: "PRESTADOR_NO_ENCONTRADO", mensaje: "x", detalles: [] } }, 404) });
    renderizar("/prestadores/perfil-1");

    expect(await screen.findByText(/no existe o no tiene servicios publicados/i)).toBeInTheDocument();
  });
});

describe("Cursos", () => {
  it("el prestador elige «Curso»: pide nombre, institución y fecha de término; folio y horas opcionales", async () => {
    simularApi({ respuestaSubida: json({ certificacion: certificacion("PENDIENTE", {
  clase: "CURSO",
  tipo: "CURSO",
  nombre: "Instalaciones eléctricas domiciliarias",
  emisor: "INACAP",
  identificador: null,
  vigenteHasta: null,
  fechaTermino: "2025-03-15T00:00:00.000Z",
  horas: 120,
}) }, 201) });
    renderizar("/mi/certificaciones");

    fireEvent.click(await screen.findByRole("radio", { name: /curso/i }));
    // Un curso no tiene tipo de catálogo ni vigencia.
    expect(screen.queryByLabelText("Tipo de certificación")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vigente hasta/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));
    await waitFor(() => expect(screen.getByLabelText("Nombre del curso")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Institución")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Fecha de término")).toHaveAttribute("aria-invalid", "true");
    // El folio es opcional en un curso: vacío no es un error.
    expect(screen.getByLabelText("Folio o código (opcional)")).not.toHaveAttribute("aria-invalid");
    expect(llamadas("POST", /certificaciones$/)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Nombre del curso"), { target: { value: "Instalaciones eléctricas domiciliarias" } });
    fireEvent.change(screen.getByLabelText("Institución"), { target: { value: "INACAP" } });
    fireEvent.change(screen.getByLabelText("Fecha de término"), { target: { value: "2025-03-15" } });
    fireEvent.change(screen.getByLabelText("Horas (opcional)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/certificado del curso/i), { target: { files: [archivo()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/curso enviado/i);
    const lista = screen.getByRole("list", { name: "Mis certificaciones y cursos" });
    expect(within(lista).getByText("Curso")).toBeInTheDocument();
    expect(within(lista).getByText("Sin folio")).toBeInTheDocument();

    const formulario = llamadas("POST", /\/api\/prestadores\/yo\/certificaciones$/)[0]?.[1]?.body as FormData;
    expect(formulario.get("tipo")).toBe("CURSO");
    expect(formulario.get("nombre")).toBe("Instalaciones eléctricas domiciliarias");
    expect(formulario.get("emisor")).toBe("INACAP");
    expect(formulario.get("fechaTermino")).toBe("2025-03-15");
    expect(formulario.get("horas")).toBe("120");
    expect(formulario.has("identificador")).toBe(false);
    expect(formulario.has("vigenteHasta")).toBe(false);
  });

  it("la lista de tipos de certificación no repite «Curso»", async () => {
    simularApi();
    renderizar("/mi/certificaciones");

    const selector = await screen.findByLabelText("Tipo de certificación");
    expect(within(selector).queryByRole("option", { name: "Curso" })).not.toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: "Otra certificación" })).toBeInTheDocument();
  });

  it("el administrador ve un curso con su institución, fecha y horas", async () => {
    simularApi({ usuario: admin, cola: [certificacion("PENDIENTE", {
  clase: "CURSO",
  tipo: "CURSO",
  nombre: "Instalaciones eléctricas domiciliarias",
  emisor: "INACAP",
  identificador: null,
  vigenteHasta: null,
  fechaTermino: "2025-03-15T00:00:00.000Z",
  horas: 120,
})] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Certificaciones y cursos" });
    const solicitud = await within(seccion).findByRole("article", { name: "Instalaciones eléctricas domiciliarias" });
    expect(within(solicitud).getByText("Curso")).toBeInTheDocument();
    expect(within(solicitud).getByText("Sin folio")).toBeInTheDocument();
    expect(within(solicitud).getByText("15 de marzo de 2025")).toBeInTheDocument();
    expect(within(solicitud).getByText("120")).toBeInTheDocument();

    fireEvent.click(within(solicitud).getByRole("button", { name: "Aprobar" }));
    expect(await within(seccion).findByRole("status")).toHaveTextContent(/curso «instalaciones eléctricas domiciliarias» de pedro soto aprobado/i);
  });

  it("el perfil público muestra la sección «Cursos» aparte de las certificaciones", async () => {
    simularApi({ usuario: null });
    renderizar("/prestadores/perfil-1");

    const cursos = await screen.findByRole("list", { name: "Cursos" });
    expect(within(cursos).getByText("Instalaciones eléctricas domiciliarias")).toBeInTheDocument();
    expect(within(cursos).getByText("INACAP")).toBeInTheDocument();
    expect(within(cursos).getByText(/terminado el 15 de marzo de 2025 · 120 horas/i)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Certificaciones" })).queryByText(/instalaciones eléctricas/i)).not.toBeInTheDocument();
  });

  it("solo con cursos no hay sello de certificaciones", async () => {
    simularApi({ usuario: null, publico: json({ prestador: { ...PRESTADOR_PUBLICO, conCertificaciones: false, certificaciones: [] } }) });
    renderizar("/prestadores/perfil-1");

    expect(await screen.findByRole("list", { name: "Cursos" })).toBeInTheDocument();
    expect(screen.queryByText("Prestador con certificaciones")).not.toBeInTheDocument();
  });
});

describe("Mensajes del envío", () => {
  /** Llena un curso válido y lo envía. */
  async function enviarCurso() {
    fireEvent.click(await screen.findByRole("radio", { name: /curso/i }));
    fireEvent.change(screen.getByLabelText("Nombre del curso"), { target: { value: "Primeros auxilios básicos" } });
    fireEvent.change(screen.getByLabelText("Institución"), { target: { value: "Cruz Roja Chilena" } });
    fireEvent.change(screen.getByLabelText("Fecha de término"), { target: { value: "2025-06-20" } });
    fireEvent.change(screen.getByLabelText(/certificado del curso/i), { target: { files: [archivo()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar a revisión" }));
  }

  it("si la API rechaza un campo que no está en pantalla, lo muestra como error junto al botón", async () => {
    // Lo que pasaba en producción: sin el tipo CURSO en el catálogo, la API
    // responde un error en «tipo», y con «Curso» elegido ese selector no se ve.
    simularApi({
      respuestaSubida: json(
        {
          error: {
            codigo: "DATOS_INVALIDOS",
            mensaje: "Los datos enviados no son válidos.",
            detalles: [{ campo: "tipo", mensaje: "Elige un tipo de certificación de la lista." }],
          },
        },
        400,
      ),
    });
    renderizar("/mi/certificaciones");

    await enviarCurso();

    const formulario = screen.getByRole("form", { name: "Nuevo envío" });
    expect(await within(formulario).findByRole("alert")).toHaveTextContent("Elige un tipo de certificación de la lista.");
  });

  it("la confirmación del envío aparece junto al botón, donde quedó la vista", async () => {
    simularApi();
    renderizar("/mi/certificaciones");

    await enviarCurso();

    const formulario = screen.getByRole("form", { name: "Nuevo envío" });
    expect(await within(formulario).findByRole("status")).toHaveTextContent(/curso enviado/i);
  });
});

describe("Catálogo sin cursos", () => {
  it("si el servidor todavía no tiene el tipo «Curso», el formulario no lo ofrece", async () => {
    simularApi({ tipos: TIPOS.filter((tipo) => tipo.codigo !== "CURSO") });
    renderizar("/mi/certificaciones");

    // El formulario de certificación sigue disponible...
    expect(await screen.findByLabelText("Tipo de certificación")).toBeInTheDocument();
    // ...pero no se puede elegir algo que el servidor rechazaría.
    expect(screen.queryByRole("radio", { name: /curso/i })).not.toBeInTheDocument();
  });
});
