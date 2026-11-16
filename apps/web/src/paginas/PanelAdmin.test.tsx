import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaAdmin from "./Admin";
import { abrirPrestador, cuerpoPendientes } from "./panelAdmin.pruebas";

/*
  El panel de administración organizado por prestador: cada prestador con
  algo pendiente aparece una vez, con un resumen; al abrirlo se despliegan
  solo las colas de lo que tiene pendiente, con solo lo suyo.
*/

const admin = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Admin", rol: "ADMINISTRADOR", correoVerificado: true };

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Foto {
  id: string;
  prestadorId: string;
  revisada: boolean;
}

interface Escenario {
  /** Identidades pendientes: id del perfil → nombre. */
  identidades?: Record<string, string>;
  fotos?: Foto[];
  reportes?: Record<string, number>;
}

const NOMBRES: Record<string, string> = { "perfil-1": "Pedro Soto", "perfil-2": "Carolina Muñoz" };

/** Simula la API con estado: lo que se resuelve deja de estar pendiente, como en la real. */
function simularApi({ identidades = {}, fotos = [], reportes = {} }: Escenario = {}) {
  const identidadesPendientes = new Map(Object.entries(identidades));
  const estadoFotos = fotos.map((foto) => ({ ...foto }));

  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = new URL(String(entrada), "http://localhost");
    const ruta = url.pathname;
    const metodo = opciones?.method ?? "GET";
    const prestador = url.searchParams.get("prestador");

    if (ruta === "/api/auth/refrescar") return json({ accessToken: "t", usuario: admin });
    if (ruta === "/api/auth/yo") return json({ usuario: admin });
    if (ruta === "/api/admin/resumen") return json({ resumen: { totalUsuarios: 3, porRol: { CLIENTE: 0, PRESTADOR: 2, ADMINISTRADOR: 1 } } });

    if (ruta === "/api/admin/pendientes") {
      const filas = Object.keys(NOMBRES)
        .map((id) => ({
          id,
          nombre: NOMBRES[id] ?? id,
          pendientes: {
            identidad: identidadesPendientes.has(id) ? 1 : 0,
            reportes: reportes[id] ?? 0,
            imagenes: estadoFotos.filter((foto) => foto.prestadorId === id && !foto.revisada).length,
          },
        }))
        .filter((fila) => fila.pendientes.identidad + fila.pendientes.reportes + fila.pendientes.imagenes > 0);
      return json(cuerpoPendientes(filas));
    }

    if (ruta === "/api/admin/identidades" && metodo === "GET") {
      const filas = [...identidadesPendientes.entries()].filter(([id]) => !prestador || id === prestador);
      return json({
        identidades: filas.map(([id, nombre]) => ({
          id: `identidad-${id}`,
          estado: "PENDIENTE",
          motivoRechazo: null,
          enviadaEn: "2026-11-10T12:00:00.000Z",
          revisadaEn: null,
          prestador: { id, nombre, rut: "12345678-5", comuna: "Santiago" },
        })),
        pagina: 1,
        porPagina: 10,
        total: filas.length,
      });
    }
    const aprobar = /^\/api\/admin\/identidades\/identidad-(.+)\/aprobar$/.exec(ruta);
    if (aprobar?.[1] && metodo === "PATCH") {
      identidadesPendientes.delete(aprobar[1]);
      return json({ identidad: { id: "x", estado: "VERIFICADA", motivoRechazo: null, revisadaEn: null } });
    }

    if (ruta === "/api/admin/imagenes" && metodo === "GET") {
      const sinRevisar = url.searchParams.get("sinRevisar") === "true";
      const filas = estadoFotos.filter((foto) => (!prestador || foto.prestadorId === prestador) && (!sinRevisar || !foto.revisada));
      return json({
        imagenes: filas.map((foto, orden) => ({
          id: foto.id,
          url: `/archivos/${foto.id}.jpg`,
          miniatura: `/archivos/${foto.id}-mini.jpg`,
          orden,
          estado: "VISIBLE",
          motivoOcultamiento: null,
          subidaEn: "2026-11-10T12:00:00Z",
          porRevisar: !foto.revisada,
          ocultadaEn: null,
          ocultadaPor: null,
          servicio: { id: `servicio-${foto.prestadorId}`, titulo: "Gasfitería a domicilio", estado: "PUBLICADO", prestador: NOMBRES[foto.prestadorId] },
        })),
        pagina: 1,
        porPagina: 20,
        total: filas.length,
      });
    }
    if (ruta === "/api/admin/imagenes/revisadas" && metodo === "PATCH") {
      const { ids } = JSON.parse(String(opciones?.body)) as { ids: string[] };
      let revisadas = 0;
      for (const foto of estadoFotos) {
        if (ids.includes(foto.id) && !foto.revisada) {
          foto.revisada = true;
          revisadas += 1;
        }
      }
      return json({ revisadas });
    }

    if (ruta === "/api/admin/reportes") return json({ casos: [], pagina: 1, porPagina: 20, total: 0 });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar() {
  const cliente = crearClienteApi();
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/iniciar-sesion" element={<p>Iniciar sesión</p>} />
          <Route path="/admin" element={<RutaProtegida><PaginaAdmin cliente={cliente} /></RutaProtegida>} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lista = () => screen.findByRole("list", { name: "Prestadores con pendientes" });

describe("Panel de administración: pendientes por prestador", () => {
  it("cada prestador con pendientes aparece una vez, con el resumen de lo que hay que revisar", async () => {
    simularApi({
      identidades: { "perfil-1": "Pedro Soto" },
      fotos: [
        { id: "f1", prestadorId: "perfil-1", revisada: false },
        { id: "f2", prestadorId: "perfil-1", revisada: false },
      ],
      reportes: { "perfil-2": 1 },
    });
    renderizar();

    const prestadores = within(await lista()).getAllByRole("listitem");
    expect(prestadores).toHaveLength(2);
    expect(screen.getByText("2 prestadores con pendientes")).toHaveAttribute("role", "status");
    const pedro = screen.getByRole("button", { name: /pedro soto/i });
    expect(pedro).toHaveTextContent("Por revisar: Verificación de identidad · 2 imágenes");
    expect(pedro).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /carolina muñoz/i })).toHaveTextContent("Por revisar: 1 reporte");
  });

  it("cerrado no muestra ni pide nada de las colas; al abrirlo despliega solo lo que ese prestador tiene pendiente", async () => {
    simularApi({ identidades: { "perfil-1": "Pedro Soto", "perfil-2": "Carolina Muñoz" }, fotos: [{ id: "f1", prestadorId: "perfil-1", revisada: false }] });
    renderizar();
    await lista();

    expect(screen.queryByRole("region", { name: "Verificación de identidad" })).not.toBeInTheDocument();
    expect(llamadas("GET", /\/api\/admin\/identidades/)).toHaveLength(0);
    expect(llamadas("GET", /\/api\/admin\/imagenes\?.*prestador=/)).toHaveLength(0);

    const boton = await abrirPrestador(/pedro soto/i);

    expect(boton).toHaveAttribute("aria-expanded", "true");
    const panel = await screen.findByRole("region", { name: "Pedro Soto" });
    const identidad = await within(panel).findByRole("region", { name: "Verificación de identidad" });
    // Solo la suya: la de Carolina no aparece dentro de Pedro.
    expect(await within(identidad).findByRole("article", { name: "Pedro Soto" })).toBeInTheDocument();
    expect(within(panel).queryByRole("article", { name: "Carolina Muñoz" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: "Imágenes por revisar" })).toBeInTheDocument();
    // No tiene certificaciones ni reportes pendientes: esas colas no se despliegan ni se piden.
    expect(within(panel).queryByRole("region", { name: "Certificaciones y cursos" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("region", { name: "Reportes" })).not.toBeInTheDocument();
    expect(llamadas("GET", /\/api\/admin\/certificaciones/)).toHaveLength(0);
    expect(String(llamadas("GET", /\/api\/admin\/identidades/)[0]?.[0])).toContain("prestador=perfil-1");
    expect(String(llamadas("GET", /\/api\/admin\/imagenes\?.*prestador=/)[0]?.[0])).toContain("sinRevisar=true");
  });

  it("abrir otro prestador cierra el anterior", async () => {
    simularApi({ identidades: { "perfil-1": "Pedro Soto", "perfil-2": "Carolina Muñoz" } });
    renderizar();

    await abrirPrestador(/pedro soto/i);
    await screen.findByRole("region", { name: "Pedro Soto" });
    await abrirPrestador(/carolina muñoz/i);

    expect(await screen.findByRole("region", { name: "Carolina Muñoz" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pedro Soto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pedro soto/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("al resolver algo, el resumen del prestador se actualiza", async () => {
    simularApi({ identidades: { "perfil-1": "Pedro Soto" }, fotos: [{ id: "f1", prestadorId: "perfil-1", revisada: false }] });
    renderizar();
    await abrirPrestador(/pedro soto/i);
    const solicitud = await screen.findByRole("article", { name: "Pedro Soto" });

    fireEvent.click(within(solicitud).getByRole("button", { name: /aprobar/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /pedro soto/i })).toHaveTextContent("Por revisar: 1 imagen"));
    expect(screen.getByRole("button", { name: /pedro soto/i })).not.toHaveTextContent("Verificación de identidad");
    // La confirmación de lo que se acaba de decidir sigue a la vista.
    expect(screen.getByText(/identidad de pedro soto aprobada/i)).toBeInTheDocument();
  });

  it("marcar las imágenes como revisadas envía las que estaban a la vista; el prestador queda sin pendientes y sale al cerrarlo", async () => {
    simularApi({
      fotos: [
        { id: "f1", prestadorId: "perfil-1", revisada: false },
        { id: "f2", prestadorId: "perfil-1", revisada: false },
        { id: "f3", prestadorId: "perfil-2", revisada: false },
      ],
    });
    renderizar();
    await abrirPrestador(/pedro soto/i);
    const panel = await screen.findByRole("region", { name: "Pedro Soto" });
    expect(await within(panel).findAllByRole("img")).toHaveLength(2);

    fireEvent.click(within(panel).getByRole("button", { name: "Marcar las 2 imágenes como revisadas" }));

    await waitFor(() => expect(llamadas("PATCH", /\/api\/admin\/imagenes\/revisadas$/)).toHaveLength(1));
    expect(JSON.parse(String(llamadas("PATCH", /revisadas$/)[0]?.[1]?.body))).toEqual({ ids: ["f1", "f2"] });
    expect(await within(panel).findByText("2 imágenes marcadas como revisadas.")).toBeInTheDocument();
    expect(await within(panel).findByText("No quedan imágenes por revisar.")).toBeInTheDocument();
    // Sigue abierto, ya sin pendientes, para alcanzar a leer la confirmación.
    const boton = screen.getByRole("button", { name: /pedro soto/i });
    await waitFor(() => expect(boton).toHaveTextContent("Sin pendientes"));
    await waitFor(() => expect(screen.getByText("1 prestador con pendientes")).toBeInTheDocument());

    fireEvent.click(boton);

    await waitFor(() => expect(screen.queryByRole("button", { name: /pedro soto/i })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /carolina muñoz/i })).toBeInTheDocument();
  });

  it("sin nada pendiente lo dice, en vez de mostrar una lista vacía", async () => {
    simularApi();
    renderizar();

    expect(await screen.findByText("No hay nada pendiente de revisión.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Prestadores con pendientes" })).not.toBeInTheDocument();
  });

  it("los títulos no se saltan niveles: sección h2, prestador h3, cola desplegada h4 y cada solicitud h5", async () => {
    simularApi({ identidades: { "perfil-1": "Pedro Soto" } });
    renderizar();
    await abrirPrestador(/pedro soto/i);
    await screen.findByRole("article", { name: "Pedro Soto" });

    expect(screen.getByRole("heading", { level: 2, name: "Pendientes por prestador" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /pedro soto/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Verificación de identidad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Pedro Soto" })).toBeInTheDocument();
  });

  it("debajo quedan, para consulta, los reportes resueltos y todas las imágenes", async () => {
    simularApi({ fotos: [{ id: "f1", prestadorId: "perfil-1", revisada: true }] });
    renderizar();

    expect(await screen.findByRole("region", { name: "Reportes resueltos" })).toBeInTheDocument();
    const imagenes = await screen.findByRole("region", { name: "Imágenes de servicios" });
    // Una foto ya revisada no es un pendiente, pero sigue consultable (y ocultable).
    expect(await within(imagenes).findByRole("img")).toBeInTheDocument();
    expect(screen.getByText("No hay nada pendiente de revisión.")).toBeInTheDocument();
    expect(String(llamadas("GET", /\/api\/admin\/reportes/)[0]?.[0])).toContain("estado=resueltos");
  });
});
