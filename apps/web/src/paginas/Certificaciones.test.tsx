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
];

function certificacion(estado: string, extra: object = {}) {
  return {
    id: "c1",
    tipo: "SEC_INSTALADOR_GAS",
    nombre: "Instalador de gas autorizado (SEC)",
    emisor: "Superintendencia de Electricidad y Combustibles",
    identificador: "SEC-2024-001",
    vigenteHasta: "2030-12-31T00:00:00.000Z",
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
}

function simularApi({ usuario = prestador, propias = [], respuestaSubida, cola = [], publico }: Escenario = {}) {
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
    if (url === "/api/certificaciones/tipos") return json({ tipos: TIPOS });
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
    const lista = screen.getByRole("list", { name: "Mis certificaciones" });
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

    const lista = await screen.findByRole("list", { name: "Mis certificaciones" });
    expect(within(lista).getByText("Rechazada")).toBeInTheDocument();
    expect(within(lista).getByText(/el folio no coincide/i)).toBeInTheDocument();
  });
});

describe("Cola de certificaciones del administrador", () => {
  it("muestra lo declarado, pide el documento a demanda y aprueba", async () => {
    simularApi({ usuario: admin, cola: [certificacion("PENDIENTE")] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Certificaciones" });
    const solicitud = await within(seccion).findByRole("article", { name: "Instalador de gas autorizado (SEC)" });
    expect(within(solicitud).getByText("SEC-2024-001")).toBeInTheDocument();
    expect(within(solicitud).getByText("12.345.678-5")).toBeInTheDocument();
    expect(llamadas("GET", /certificaciones\/c1\/documento$/)).toHaveLength(0);

    fireEvent.click(within(solicitud).getByRole("button", { name: "Ver documento" }));
    expect(await within(solicitud).findByRole("img")).toHaveAttribute("src", "https://api.cloudinary.com/firmada/c.jpg");

    fireEvent.click(within(solicitud).getByRole("button", { name: "Aprobar" }));
    expect(await within(seccion).findByRole("status")).toHaveTextContent(/aprobada\. el documento fue eliminado/i);
    expect(llamadas("PATCH", /\/api\/admin\/certificaciones\/c1\/aprobar$/)).toHaveLength(1);
    expect(await within(seccion).findByText(/no hay certificaciones pendientes/i)).toBeInTheDocument();
  });

  it("rechazar exige un motivo y lo envía", async () => {
    simularApi({ usuario: admin, cola: [certificacion("PENDIENTE")] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Certificaciones" });
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
