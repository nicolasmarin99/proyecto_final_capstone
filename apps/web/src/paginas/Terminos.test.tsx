import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { ExigirTerminos } from "../componentes/ExigirTerminos";
import { Footer } from "../componentes/landing/Footer";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaAceptarTerminos from "./AceptarTerminos";
import PaginaRegistro from "./Registro";
import PaginaRegistroPrestador from "./RegistroPrestador";
import PaginaTerminos from "./Terminos";

const CONTENIDO = [
  "# Términos y condiciones y Política de privacidad de LocalCL",
  "Versión 2026-11, vigente desde el 18 de noviembre de 2026.",
  "## Parte I. Términos y condiciones de uso {#terminos}",
  "### 1. Quiénes somos",
  "LocalCL es un intermediario de información.\nNo presta los servicios publicados.",
  "- Ser mayor de 18 años.\n- Entregar datos verdaderos.",
  "## Parte II. Política de privacidad {#privacidad}",
  "### 10. Tus derechos",
  "Texto con <script>alert(1)</script> que debe verse como texto.",
].join("\n\n");

const TERMINOS = { version: "2026-11", vigenteDesde: "2026-11-18T03:00:00.000Z", contenido: CONTENIDO };

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: object | null;
  /** Respuesta a POST /terminos/aceptar. */
  aceptar?: Response;
  /** Versiones que va entregando GET /terminos/vigente, una por llamada (la última se repite). */
  versiones?: (typeof TERMINOS)[];
}

function simularApi({ usuario = null, aceptar, versiones = [TERMINOS] }: Escenario = {}) {
  let llamadasVigente = 0;
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";
    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/auth/logout") return { ok: true, status: 204, json: async () => null } as Response;
    if (url === "/api/terminos/vigente") {
      const version = versiones[Math.min(llamadasVigente, versiones.length - 1)];
      llamadasVigente += 1;
      return json({ terminos: version });
    }
    if (url === "/api/terminos/aceptar" && metodo === "POST") return aceptar ?? json({ version: "2026-11", terminosPendientes: false });
    if (url === "/api/cuenta/foto") return json({ foto: null, retirada: null });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar(ruta: string, api: ClienteApi = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={api}>
        <Routes>
          <Route path="/terminos" element={<PaginaTerminos cliente={api} />} />
          <Route path="/aceptar-terminos" element={<PaginaAceptarTerminos cliente={api} />} />
          <Route element={<ExigirTerminos />}>
            <Route path="/" element={<p>Página de inicio</p>} />
            <Route path="/registro" element={<PaginaRegistro cliente={api} />} />
            <Route path="/registro-prestador" element={<PaginaRegistroPrestador cliente={api} />} />
            <Route path="/perfil" element={<RutaProtegida><p>Mi perfil de prueba</p></RutaProtegida>} />
          </Route>
          <Route path="/iniciar-sesion" element={<p>Pantalla de inicio de sesión</p>} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

const CUENTA_ANTIGUA = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true, terminosPendientes: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Registro: las casillas son obligatorias", () => {
  function escribir(etiqueta: RegExp, valor: string) {
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
  }

  it("cliente: no vienen marcadas, enlazan al documento y sin marcarlas no se envía nada", async () => {
    simularApi();
    renderizar("/registro");

    const casilla = await screen.findByLabelText(/leí y acepto/i);
    expect(casilla).not.toBeChecked();
    expect(screen.getByLabelText(/mayor de 18 años/i)).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("href", "/terminos");
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/terminos#privacidad");
    await screen.findByText(/términos vigentes: versión 2026-11/i);

    escribir(/^nombre$/i, "Ana Pérez");
    escribir(/^correo$/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Debes aceptar los términos y condiciones y la política de privacidad.")).toBeInTheDocument();
    expect(screen.getByText("Debes ser mayor de 18 años para crear una cuenta.")).toBeInTheDocument();
    expect(screen.getByLabelText(/leí y acepto/i)).toHaveAttribute("aria-invalid", "true");
    expect(llamadas("POST", /\/api\/auth\/registro/)).toHaveLength(0);
  });

  it("prestador: con solo una de las dos casillas, tampoco se envía", async () => {
    simularApi();
    renderizar("/registro-prestador");

    await screen.findByText(/términos vigentes: versión 2026-11/i);
    escribir(/^nombre$/i, "Pedro Soto");
    escribir(/^correo$/i, "pedro@ejemplo.cl");
    escribir(/^rut$/i, "12.345.678-5");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByLabelText(/leí y acepto/i));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    expect(await screen.findByText("Debes ser mayor de 18 años para crear una cuenta.")).toBeInTheDocument();
    expect(llamadas("POST", /\/api\/auth\/registro/)).toHaveLength(0);
  });

  it("si los términos cambiaron mientras llenaba el formulario, desmarca la casilla y carga la versión nueva", async () => {
    simularApi({ versiones: [TERMINOS, { ...TERMINOS, version: "2027-01" }] });
    const original = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (entrada, opciones) =>
      String(entrada) === "/api/auth/registro"
        ? json({ error: { codigo: "TERMINOS_DESACTUALIZADOS", mensaje: "Los términos y condiciones cambiaron mientras los leías." } }, 409)
        : (original?.(entrada, opciones) ?? json({}, 500)),
    );
    renderizar("/registro");

    await screen.findByText(/términos vigentes: versión 2026-11/i);
    escribir(/^nombre$/i, "Ana Pérez");
    escribir(/^correo$/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByLabelText(/leí y acepto/i));
    fireEvent.click(screen.getByLabelText(/mayor de 18 años/i));
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/términos vigentes: versión 2027-01/i)).toBeInTheDocument();
    expect(screen.getByText("Los términos y condiciones cambiaron mientras los leías.")).toBeInTheDocument();
    expect(screen.getByLabelText(/leí y acepto/i)).not.toBeChecked();
  });
});

describe("Página /terminos", () => {
  it("muestra el documento con sus dos partes, con anclas, y se puede imprimir", async () => {
    simularApi();
    renderizar("/terminos");

    expect(await screen.findByRole("heading", { level: 1, name: /términos y condiciones y política de privacidad/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /parte i\. términos y condiciones/i })).toHaveAttribute("id", "terminos");
    expect(screen.getByRole("heading", { level: 2, name: /parte ii\. política de privacidad/i })).toHaveAttribute("id", "privacidad");
    expect(screen.getByText("LocalCL es un intermediario de información. No presta los servicios publicados.")).toBeInTheDocument();
    const documento = screen.getByRole("article");
    expect(within(documento).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Ser mayor de 18 años.", "Entregar datos verdaderos."]);

    const imprimir = vi.spyOn(window, "print").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: /imprimir o guardar como pdf/i }));
    expect(imprimir).toHaveBeenCalled();
  });

  it("el texto se dibuja como texto: nunca como HTML", async () => {
    simularApi();
    const { container } = renderizar("/terminos");

    expect(await screen.findByText("Texto con <script>alert(1)</script> que debe verse como texto.")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("Una cuenta que no aceptó la versión vigente", () => {
  it("es llevada a aceptarlos desde cualquier página, y al aceptar vuelve a donde iba", async () => {
    simularApi({ usuario: CUENTA_ANTIGUA });
    renderizar("/perfil");

    expect(await screen.findByRole("heading", { name: "Actualizamos nuestros términos" })).toBeInTheDocument();
    const documento = await screen.findByRole("region", { name: /versión 2026-11/i });
    expect(within(documento).getByRole("heading", { name: /parte ii\. política de privacidad/i })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/leí y acepto/i));
    fireEvent.click(screen.getByRole("button", { name: /aceptar y continuar/i }));

    expect(await screen.findByText("Mi perfil de prueba")).toBeInTheDocument();
    const [llamada] = llamadas("POST", /\/api\/terminos\/aceptar$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ aceptaTerminos: true, versionTerminos: "2026-11" });
  });

  it("sin marcar la casilla no se envía nada", async () => {
    simularApi({ usuario: CUENTA_ANTIGUA });
    renderizar("/perfil");

    fireEvent.click(await screen.findByRole("button", { name: /aceptar y continuar/i }));

    expect(await screen.findByText(/debes aceptar los términos y condiciones y la política de privacidad para continuar/i)).toBeInTheDocument();
    expect(llamadas("POST", /\/api\/terminos\/aceptar$/)).toHaveLength(0);
  });

  it("si la versión cambió mientras la leía, muestra la nueva y vuelve a pedir la casilla", async () => {
    simularApi({
      usuario: CUENTA_ANTIGUA,
      versiones: [TERMINOS, { ...TERMINOS, version: "2027-01" }],
      aceptar: json({ error: { codigo: "TERMINOS_DESACTUALIZADOS", mensaje: "Los términos y condiciones cambiaron mientras los leías." } }, 409),
    });
    renderizar("/perfil");

    fireEvent.click(await screen.findByLabelText(/leí y acepto/i));
    fireEvent.click(screen.getByRole("button", { name: /aceptar y continuar/i }));

    expect(await screen.findByRole("region", { name: /versión 2027-01/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/leí y acepto/i)).not.toBeChecked();
    expect(screen.getByText("Los términos y condiciones cambiaron mientras los leías.")).toBeInTheDocument();
  });

  it("puede no aceptar y cerrar sesión", async () => {
    simularApi({ usuario: CUENTA_ANTIGUA });
    renderizar("/perfil");

    fireEvent.click(await screen.findByRole("button", { name: /no acepto, cerrar sesión/i }));

    expect(await screen.findByText("Página de inicio")).toBeInTheDocument();
    await waitFor(() => expect(llamadas("POST", /\/api\/auth\/logout$/)).toHaveLength(1));
    expect(llamadas("POST", /\/api\/terminos\/aceptar$/)).toHaveLength(0);
  });

  it("una cuenta al día no ve la pantalla de aceptación", async () => {
    simularApi({ usuario: { ...CUENTA_ANTIGUA, terminosPendientes: false } });
    renderizar("/perfil");

    expect(await screen.findByText("Mi perfil de prueba")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Actualizamos nuestros términos" })).not.toBeInTheDocument();
  });

  it("sin sesión, las páginas públicas siguen abiertas", async () => {
    simularApi();
    renderizar("/");

    expect(await screen.findByText("Página de inicio")).toBeInTheDocument();
  });
});

describe("Pie de página", () => {
  it("«Términos» y «Privacidad» llevan al documento", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/terminos");
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/terminos#privacidad");
  });
});
