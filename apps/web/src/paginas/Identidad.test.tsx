import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaAdmin from "./Admin";
import PaginaPerfil from "./Perfil";
import PaginaPerfilPrestador from "./PerfilPrestador";

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

type Estado = "PENDIENTE" | "VERIFICADA" | "RECHAZADA";

function identidad(estado: Estado, motivoRechazo: string | null = null) {
  return { estado, motivoRechazo, enviadaEn: "2026-10-10T12:00:00.000Z", revisadaEn: null };
}

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof prestador | typeof admin;
  estadoIdentidad?: ReturnType<typeof identidad> | null;
  respuestaSubida?: Response;
  cola?: { id: string; nombre: string; rut: string }[];
}

/** Simula la API respondiendo según método y ruta. */
function simularApi({ usuario = prestador, estadoIdentidad = null, respuestaSubida, cola = [] }: Escenario = {}) {
  // Como la API real: una solicitud aprobada o rechazada deja de estar en la cola.
  const resueltas = new Set<string>();

  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") return json({ accessToken: "t", usuario });
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/comunas") return json({ comunas: [COMUNA] });
    if (url === "/api/prestadores/yo") return json({ perfil: PERFIL });
    if (url === "/api/prestadores/yo/identidad" && metodo === "POST") {
      return respuestaSubida ?? json({ identidad: identidad("PENDIENTE") }, 201);
    }
    if (url === "/api/prestadores/yo/identidad") {
      return json({ identidad: estadoIdentidad, cargasDisponibles: 3 });
    }
    if (url === "/api/admin/resumen") {
      return json({ resumen: { totalUsuarios: 2, porRol: { CLIENTE: 0, PRESTADOR: 1, ADMINISTRADOR: 1 } } });
    }
    if (url.startsWith("/api/admin/identidades?")) {
      return json({
        identidades: cola.filter((fila) => !resueltas.has(fila.id)).map((fila) => ({
          id: fila.id,
          estado: "PENDIENTE",
          motivoRechazo: null,
          enviadaEn: "2026-10-10T12:00:00.000Z",
          revisadaEn: null,
          prestador: { nombre: fila.nombre, rut: fila.rut, comuna: "Santiago" },
        })),
        pagina: 1,
        porPagina: 10,
        total: cola.filter((fila) => !resueltas.has(fila.id)).length,
      });
    }
    if (/\/api\/admin\/identidades\/[^/]+\/documento$/.test(url)) {
      return json({ url: "https://api.cloudinary.com/firmada/x.jpg", expiraEn: "2026-10-10T12:05:00.000Z" });
    }
    const decision = /\/api\/admin\/identidades\/([^/]+)\/(aprobar|rechazar)$/.exec(url);
    if (decision?.[1]) {
      resueltas.add(decision[1]);
      return json({ identidad: { id: "x", estado: "VERIFICADA", motivoRechazo: null, revisadaEn: null } });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

/** Llamadas que llegaron a la API con un método y una ruta. */
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
          <Route path="/perfil" element={<RutaProtegida><PaginaPerfil cliente={cliente} /></RutaProtegida>} />
          <Route
            path="/perfil-prestador"
            element={<RutaProtegida roles={["PRESTADOR"]}><PaginaPerfilPrestador cliente={cliente} /></RutaProtegida>}
          />
          <Route path="/admin" element={<RutaProtegida><PaginaAdmin cliente={cliente} /></RutaProtegida>} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function elegirArchivo(archivo: File) {
  fireEvent.change(screen.getByLabelText(/documento de identidad/i), { target: { files: [archivo] } });
}

function archivo(nombre: string, tipo: string, bytes = 1024) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Verificación de identidad del prestador", () => {
  it("explica para qué se usa el documento y que se elimina al verificar", async () => {
    simularApi();
    renderizar("/perfil-prestador");

    const seccion = await screen.findByRole("region", { name: /verifica tu identidad/i });
    expect(within(seccion).getByText(/se elimina/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/compara el nombre y el rut/i)).toBeInTheDocument();
  });

  it("sube el documento como multipart y muestra que quedó en revisión", async () => {
    simularApi();
    renderizar("/perfil-prestador");
    // El campo aparece cuando llega el estado desde la API.
    await screen.findByLabelText(/documento de identidad/i);

    elegirArchivo(archivo("cedula.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: /enviar documento/i }));

    expect(await screen.findByText(/en revisión/i)).toBeInTheDocument();
    const [llamada] = llamadas("POST", /\/api\/prestadores\/yo\/identidad$/);
    const cuerpo = llamada?.[1]?.body;
    expect(cuerpo).toBeInstanceOf(FormData);
    expect((cuerpo as FormData).get("documento")).toBeInstanceOf(File);
  });

  it.each([
    ["un archivo de más de 5 MB", archivo("cedula.jpg", "image/jpeg", 5 * 1024 * 1024 + 1), /5 MB/],
    ["un formato no permitido", archivo("cedula.gif", "image/gif"), /JPG, PNG o PDF/],
  ])("avisa en el navegador antes de enviar %s", async (_caso, elegido, mensaje) => {
    simularApi();
    renderizar("/perfil-prestador");
    // El campo aparece cuando llega el estado desde la API.
    await screen.findByLabelText(/documento de identidad/i);

    elegirArchivo(elegido);
    fireEvent.click(screen.getByRole("button", { name: /enviar documento/i }));

    // El mensaje queda enlazado al campo (aria-describedby), no suelto en la página.
    const campo = screen.getByLabelText(/documento de identidad/i);
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription(mensaje);
    expect(llamadas("POST", /identidad$/)).toHaveLength(0);
  });

  it("muestra el error de la API (límite de cargas)", async () => {
    simularApi({
      respuestaSubida: json(
        { error: { codigo: "DEMASIADAS_CARGAS", mensaje: "Puedes subir tu documento hasta 3 veces en 24 horas." } },
        429,
      ),
    });
    renderizar("/perfil-prestador");
    // El campo aparece cuando llega el estado desde la API.
    await screen.findByLabelText(/documento de identidad/i);

    elegirArchivo(archivo("cedula.png", "image/png"));
    fireEvent.click(screen.getByRole("button", { name: /enviar documento/i }));

    expect(await screen.findByText(/hasta 3 veces en 24 horas/i)).toBeInTheDocument();
  });

  it("rechazada: muestra el motivo y deja volver a subir", async () => {
    simularApi({ estadoIdentidad: identidad("RECHAZADA", "La foto está borrosa y no se lee el RUT.") });
    renderizar("/perfil-prestador");

    expect(await screen.findByText("La foto está borrosa y no se lee el RUT.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar documento/i })).toBeInTheDocument();
  });

  it("pendiente o verificada: no ofrece volver a subir", async () => {
    simularApi({ estadoIdentidad: identidad("VERIFICADA") });
    renderizar("/perfil-prestador");

    expect(await screen.findByText(/identidad verificada/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar documento/i })).not.toBeInTheDocument();
  });

  it("en /perfil, el paso de identidad refleja el estado real", async () => {
    simularApi({ estadoIdentidad: identidad("PENDIENTE") });
    renderizar("/perfil");

    const lista = await screen.findByRole("list", { name: /para aparecer en las búsquedas/i });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")[1]).toHaveTextContent(/en revisión/i));
  });
});

describe("Cola de revisión del administrador", () => {
  const COLA = [{ id: "c1", nombre: "Pedro Soto", rut: "12345678-5" }];

  it("lista las pendientes con nombre y RUT", async () => {
    simularApi({ usuario: admin, cola: COLA });
    renderizar("/admin");

    const fila = await screen.findByRole("article", { name: /pedro soto/i });
    expect(within(fila).getByText("12.345.678-5")).toBeInTheDocument();
  });

  it("muestra el documento con la URL firmada, solo cuando se pide", async () => {
    simularApi({ usuario: admin, cola: COLA });
    renderizar("/admin");
    const fila = await screen.findByRole("article", { name: /pedro soto/i });

    expect(within(fila).queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(within(fila).getByRole("button", { name: /ver documento/i }));

    const imagen = await within(fila).findByRole("img", { name: /documento de identidad de pedro soto/i });
    expect(imagen).toHaveAttribute("src", "https://api.cloudinary.com/firmada/x.jpg");
    expect(llamadas("GET", /\/api\/admin\/identidades\/c1\/documento$/)).toHaveLength(1);
  });

  it("aprobar llama a la API y saca la solicitud de la cola", async () => {
    simularApi({ usuario: admin, cola: COLA });
    renderizar("/admin");
    const fila = await screen.findByRole("article", { name: /pedro soto/i });

    fireEvent.click(within(fila).getByRole("button", { name: /aprobar/i }));

    await waitFor(() => expect(screen.queryByRole("article", { name: /pedro soto/i })).not.toBeInTheDocument());
    expect(llamadas("PATCH", /\/c1\/aprobar$/)).toHaveLength(1);
  });

  it("rechazar exige escribir el motivo antes de enviar", async () => {
    simularApi({ usuario: admin, cola: COLA });
    renderizar("/admin");
    const fila = await screen.findByRole("article", { name: /pedro soto/i });

    fireEvent.click(within(fila).getByRole("button", { name: /^rechazar$/i }));
    fireEvent.click(within(fila).getByRole("button", { name: /confirmar rechazo/i }));
    expect(await within(fila).findByText(/indica el motivo/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /rechazar$/)).toHaveLength(0);

    fireEvent.change(within(fila).getByLabelText(/motivo del rechazo/i), {
      target: { value: "La foto está borrosa y no se lee el RUT." },
    });
    fireEvent.click(within(fila).getByRole("button", { name: /confirmar rechazo/i }));

    await waitFor(() => expect(llamadas("PATCH", /\/c1\/rechazar$/)).toHaveLength(1));
    const cuerpo = JSON.parse(String(llamadas("PATCH", /rechazar$/)[0]?.[1]?.body));
    expect(cuerpo).toEqual({ motivo: "La foto está borrosa y no se lee el RUT." });
  });

  it("sin pendientes lo dice en vez de mostrar una lista vacía", async () => {
    simularApi({ usuario: admin, cola: [] });
    renderizar("/admin");

    expect(await screen.findByText(/no hay identidades pendientes/i)).toBeInTheDocument();
  });
});
