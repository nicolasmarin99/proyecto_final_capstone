import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import App from "../App";
import { ProveedorAuth } from "../auth/ContextoAuth";

const CLIENTE = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true };
const PRESTADOR = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const ADMIN = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Marta Rojas", rol: "ADMINISTRADOR", correoVerificado: true };
const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };

const SERVICIO = {
  id: "s1",
  titulo: "Gasfitería a domicilio",
  descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
  precioDesde: null,
  precioHasta: null,
  unidadPrecio: null,
  categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
  categoriaPersonalizada: null,
  imagenes: [],
  prestador: { id: "perfil-1", nombre: "Pedro Soto", comunas: [], credenciales: [] },
};

const HACE_TRES_DIAS = 3 * 24 * 60;

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof CLIENTE | typeof PRESTADOR | typeof ADMIN | null;
  miReporte?: { motivo: string; enviadoEn: string } | null;
  respuestaReporte?: Response;
}

function simularApi({ usuario = CLIENTE, miReporte = null, respuestaReporte }: Escenario = {}) {
  let propio = miReporte;

  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/servicios/s1") return json({ servicio: SERVICIO });
    if (url === "/api/servicios/s1/reportes/mio" && metodo === "GET") return json({ reporte: propio });
    if (url === "/api/servicios/s1/reportes/mio" && metodo === "DELETE") {
      propio = null;
      return { ok: true, status: 204, json: async () => null } as Response;
    }
    if (url === "/api/servicios/s1/reportes" && metodo === "POST") {
      return respuestaReporte ?? json({ mensaje: "Gracias. Revisaremos esta publicación." }, 202);
    }
    // Panel
    if (url === "/api/admin/resumen") return json({ resumen: { totalUsuarios: 3, porRol: { CLIENTE: 1, PRESTADOR: 1, ADMINISTRADOR: 1 } } });
    if (url.startsWith("/api/admin/identidades")) return json({ identidades: [], pagina: 1, porPagina: 10, total: 0 });
    if (url.startsWith("/api/admin/imagenes")) return json({ imagenes: [], pagina: 1, porPagina: 20, total: 0 });
    if (url === "/api/admin/reportes?estado=pendientes") {
      return json({
        servicios: [
          {
            servicio: { id: "s1", titulo: "Gasfitería a domicilio", estado: "PUBLICADO", prestador: "Pedro Soto" },
            personas: 4,
            reportes: 4,
            motivoFrecuente: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION",
            prioridad: "ALTA",
            primerReporte: "2026-10-10T12:00:00Z",
            esperaMinutos: HACE_TRES_DIAS,
            decision: null,
          },
          {
            servicio: { id: "s2", titulo: "Muebles de cocina", estado: "PUBLICADO", prestador: "Jorge Ramírez" },
            personas: 1,
            reportes: 1,
            motivoFrecuente: "CONTENIDO_ENGANOSO",
            prioridad: "NORMAL",
            primerReporte: "2026-10-12T12:00:00Z",
            esperaMinutos: 90,
            decision: null,
          },
        ],
        pagina: 1,
        porPagina: 20,
        total: 2,
      });
    }
    if (url === "/api/admin/reportes?estado=resueltos") return json({ servicios: [], pagina: 1, porPagina: 20, total: 0 });
    if (url === "/api/admin/reportes/s1" || /\/api\/admin\/reportes\/s1\/(desestimar|ocultar)$/.test(url)) {
      const oculto = url.endsWith("/ocultar");
      return json({
        servicio: { id: "s1", titulo: "Gasfitería a domicilio", estado: oculto ? "OCULTO" : "PUBLICADO", categoria: "Gasfitería", prestador: "Pedro Soto" },
        personas: 2,
        reportes: [
          { id: "r1", motivo: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION", comentario: "Pone su WhatsApp en el texto.", estado: "ABIERTA", enviadoEn: "2026-10-10T12:00:00Z", cuentaConMasDeUnaSemana: true },
          { id: "r2", motivo: "OTRO", comentario: "Cobra por adelantado.", estado: "ABIERTA", enviadoEn: "2026-10-11T12:00:00Z", cuentaConMasDeUnaSemana: false },
        ],
        decisiones: [],
      });
    }
    // Prestador
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/prestadores/yo") {
      return json({ perfil: { id: "perfil-1", descripcion: "Gasfíter.", telefono: "+56912345678", radioAtencionKm: 10, comuna: SANTIAGO, comunasAtencion: [SANTIAGO] } });
    }
    if (url === "/api/servicios/mios") {
      return json({
        servicios: [
          {
            ...SERVICIO,
            estado: "OCULTO",
            moderacion: { motivo: "Publica datos de contacto en la descripción.", ocultadoEn: "2026-10-12T15:00:00Z" },
          },
        ],
        requisitosPendientes: [],
      });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={crearClienteApi()}>
        <App />
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

async function abrirDialogo() {
  fireEvent.click(await screen.findByRole("button", { name: "Reportar esta publicación" }));
  return screen.findByRole("dialog", { name: "Reportar esta publicación" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Reportar desde la página pública", () => {
  it("sin sesión, invita a iniciarla", async () => {
    simularApi({ usuario: null });
    renderizar("/servicios/s1");

    const dialogo = await abrirDialogo();

    expect(within(dialogo).getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/iniciar-sesion");
    expect(within(dialogo).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("envía el motivo y el comentario, y agradece sin decir cuántos reportes hay", async () => {
    simularApi();
    renderizar("/servicios/s1");
    const dialogo = await abrirDialogo();

    fireEvent.click(await within(dialogo).findByRole("radio", { name: /datos de contacto en la descripción/i }));
    fireEvent.change(within(dialogo).getByLabelText(/^comentario/i), { target: { value: "Pone su WhatsApp en el texto." } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar reporte" }));

    expect(await within(dialogo).findByText("Gracias. Revisaremos esta publicación.")).toBeInTheDocument();
    expect(JSON.parse(String(llamadas("POST", /\/api\/servicios\/s1\/reportes$/)[0]?.[1]?.body))).toEqual({
      motivo: "DATOS_DE_CONTACTO_EN_LA_DESCRIPCION",
      comentario: "Pone su WhatsApp en el texto.",
    });
    expect(dialogo.textContent).not.toMatch(/\d+ reportes?|personas/i);
  });

  it("con «Otro» exige comentario antes de enviar", async () => {
    simularApi();
    renderizar("/servicios/s1");
    const dialogo = await abrirDialogo();

    fireEvent.click(await within(dialogo).findByRole("radio", { name: /^otro/i }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar reporte" }));

    expect(await within(dialogo).findByText(/cuéntanos qué pasa en al menos 10 caracteres/i)).toBeInTheDocument();
    expect(llamadas("POST", /reportes$/)).toHaveLength(0);
  });

  it("muestra el error de la API, como el límite diario", async () => {
    simularApi({
      respuestaReporte: json({ error: { codigo: "DEMASIADOS_REPORTES", mensaje: "Puedes enviar hasta 5 reportes en 24 horas. Inténtalo más tarde." } }, 429),
    });
    renderizar("/servicios/s1");
    const dialogo = await abrirDialogo();

    fireEvent.click(await within(dialogo).findByRole("radio", { name: /contenido engañoso/i }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar reporte" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/hasta 5 reportes en 24 horas/i);
  });

  it("si ya reportó, ofrece retirar el reporte en vez de repetirlo", async () => {
    simularApi({ miReporte: { motivo: "CONTENIDO_ENGANOSO", enviadoEn: "2026-10-12T10:00:00Z" } });
    renderizar("/servicios/s1");
    const dialogo = await abrirDialogo();

    expect(await within(dialogo).findByText(/ya reportaste esta publicación/i)).toBeInTheDocument();
    expect(within(dialogo).queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Retirar mi reporte" }));

    expect(await within(dialogo).findByText("Retiraste tu reporte.")).toBeInTheDocument();
    expect(llamadas("DELETE", /\/api\/servicios\/s1\/reportes\/mio$/)).toHaveLength(1);
  });

  it("el diálogo se cierra con Escape y devuelve el foco al enlace", async () => {
    simularApi();
    renderizar("/servicios/s1");
    const enlace = await screen.findByRole("button", { name: "Reportar esta publicación" });
    fireEvent.click(enlace);
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(enlace).toHaveFocus();
  });
});

describe("Reportes en el panel de administración", () => {
  it("muestra la cola agrupada, con la prioridad alta destacada y el tiempo de espera", async () => {
    simularApi({ usuario: ADMIN });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Reportes" });
    const urgente = await within(seccion).findByRole("article", { name: "Reportes de «Gasfitería a domicilio»" });
    const normal = within(seccion).getByRole("article", { name: "Reportes de «Muebles de cocina»" });

    expect(within(urgente).getByText("Prioridad alta")).toBeInTheDocument();
    expect(within(normal).queryByText("Prioridad alta")).not.toBeInTheDocument();
    expect(within(urgente).getByText("4")).toBeInTheDocument();
    expect(within(urgente).getByText("Datos de contacto en la descripción")).toBeInTheDocument();
    expect(within(urgente).getByText("hace 3 días")).toBeInTheDocument();
    expect(within(normal).getByText("hace 1 hora")).toBeInTheDocument();
  });

  it("el detalle muestra los reportes sin quién los hizo, y ocultar exige motivo", async () => {
    simularApi({ usuario: ADMIN });
    renderizar("/admin");
    const urgente = await screen.findByRole("article", { name: "Reportes de «Gasfitería a domicilio»" });

    fireEvent.click(within(urgente).getByRole("button", { name: "Revisar" }));

    expect(await within(urgente).findByText("«Pone su WhatsApp en el texto.»")).toBeInTheDocument();
    expect(within(urgente).getByText("Cuenta con más de una semana")).toBeInTheDocument();
    expect(within(urgente).getByText("Cuenta creada hace menos de una semana")).toBeInTheDocument();

    fireEvent.click(within(urgente).getByRole("button", { name: "Ocultar servicio" }));
    fireEvent.click(within(urgente).getAllByRole("button", { name: "Ocultar servicio" }).at(-1) as HTMLElement);
    expect(await within(urgente).findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /ocultar$/)).toHaveLength(0);

    fireEvent.change(within(urgente).getByLabelText(/motivo/i), { target: { value: "Publica datos de contacto en la descripción." } });
    fireEvent.click(within(urgente).getAllByRole("button", { name: "Ocultar servicio" }).at(-1) as HTMLElement);

    await waitFor(() => expect(llamadas("PATCH", /\/api\/admin\/reportes\/s1\/ocultar$/)).toHaveLength(1));
    expect(JSON.parse(String(llamadas("PATCH", /ocultar$/)[0]?.[1]?.body))).toEqual({ motivo: "Publica datos de contacto en la descripción." });
    expect(await screen.findByText("«Gasfitería a domicilio» quedó oculto.")).toBeInTheDocument();
  });

  it("desestimar también exige motivo", async () => {
    simularApi({ usuario: ADMIN });
    renderizar("/admin");
    const urgente = await screen.findByRole("article", { name: "Reportes de «Gasfitería a domicilio»" });
    fireEvent.click(within(urgente).getByRole("button", { name: "Revisar" }));

    fireEvent.click(await within(urgente).findByRole("button", { name: "Desestimar" }));
    fireEvent.change(within(urgente).getByLabelText(/motivo/i), { target: { value: "La descripción cumple las reglas." } });
    fireEvent.click(within(urgente).getByRole("button", { name: "Desestimar reportes" }));

    await waitFor(() => expect(llamadas("PATCH", /\/api\/admin\/reportes\/s1\/desestimar$/)).toHaveLength(1));
    expect(JSON.parse(String(llamadas("PATCH", /desestimar$/)[0]?.[1]?.body))).toEqual({ motivo: "La descripción cumple las reglas." });
  });
});

describe("El prestador en /mi/servicios", () => {
  it("ve que su servicio fue ocultado y por qué, sin nada sobre los reportes", async () => {
    simularApi({ usuario: PRESTADOR });
    renderizar("/mi/servicios");

    const fila = await screen.findByRole("article", { name: "Gasfitería a domicilio" });

    expect(within(fila).getByText("Oculto por moderación")).toBeInTheDocument();
    expect(within(fila).getByText(/fue ocultado por moderación/i)).toBeInTheDocument();
    expect(within(fila).getByText("Publica datos de contacto en la descripción.")).toBeInTheDocument();
    expect(fila.textContent).not.toMatch(/report|denuncia|personas/i);
  });
});
