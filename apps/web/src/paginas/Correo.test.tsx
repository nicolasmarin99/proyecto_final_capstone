import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaCambiarContrasena from "./CambiarContrasena";
import PaginaRecuperarCuenta from "./RecuperarCuenta";
import PaginaRestablecerContrasena from "./RestablecerContrasena";
import PaginaRevisaTuCorreo from "./RevisaTuCorreo";
import PaginaVerificarCorreo from "./VerificarCorreo";

const usuario = {
  id: "u1",
  correo: "ana@ejemplo.cl",
  nombre: "Ana Pérez",
  rol: "CLIENTE",
  correoVerificado: true,
};

function json(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

function sinSesion() {
  vi.mocked(fetch).mockResolvedValue(json({ error: { codigo: "SESION_INVALIDA" } }, 401));
}

/** Renderiza una ruta pública aislada, con el proveedor porque algunas lo usan. */
function renderizar(rutaInicial: string, elemento: React.ReactElement, api = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <ProveedorAuth cliente={api}>
        <Routes>
          <Route path={rutaInicial.split("?")[0]} element={elemento} />
          <Route path="/iniciar-sesion" element={<p>Pantalla de inicio de sesión</p>} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function escribir(etiqueta: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Verificar correo", () => {
  it("canjea el token del enlace y confirma", async () => {
    const api = crearClienteApi();
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/api/auth/verificar-correo"
        ? json({ mensaje: "ok" })
        : json({ error: { codigo: "SESION_INVALIDA" } }, 401),
    );

    renderizar("/verificar-correo?token=abc123", <PaginaVerificarCorreo cliente={api} />, api);

    expect(await screen.findByText(/tu correo quedó confirmado/i)).toBeInTheDocument();

    const envio = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url) === "/api/auth/verificar-correo");

    // El token llega por la URL pero se envía en el cuerpo, no en la ruta.
    expect(String(envio?.[1]?.body)).toContain('"token":"abc123"');
  });

  it("muestra el mismo aviso para un enlace vencido que para uno inventado", async () => {
    const api = crearClienteApi();
    vi.mocked(fetch).mockResolvedValue(json({ error: { codigo: "ENLACE_INVALIDO" } }, 400));

    renderizar("/verificar-correo?token=loquesea", <PaginaVerificarCorreo cliente={api} />, api);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no es válido o ya expiró/i);
  });

  it("no llama al servidor si el enlace viene sin token", async () => {
    const api = crearClienteApi();
    sinSesion();

    renderizar("/verificar-correo", <PaginaVerificarCorreo cliente={api} />, api);

    expect(await screen.findByRole("alert")).toBeInTheDocument();

    const envios = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/verificar-correo");

    expect(envios).toHaveLength(0);
  });
});

describe("Revisa tu correo", () => {
  it("permite reenviar el enlace y responde siempre lo mismo", async () => {
    const api = crearClienteApi();
    sinSesion();

    render(
      <MemoryRouter initialEntries={[{ pathname: "/revisa-tu-correo", state: { correo: "ana@ejemplo.cl" } }]}>
        <ProveedorAuth cliente={api}>
          <Routes>
            <Route path="/revisa-tu-correo" element={<PaginaRevisaTuCorreo cliente={api} />} />
          </Routes>
        </ProveedorAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText(/ana@ejemplo.cl/)).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValue(json({ mensaje: "ok" }, 202));
    fireEvent.click(screen.getByRole("button", { name: /reenviar el enlace/i }));

    expect(await screen.findByText(/te lo enviamos de nuevo/i)).toBeInTheDocument();
  });

  it("no afirma que la cuenta fue creada", () => {
    const api = crearClienteApi();
    sinSesion();

    renderizar("/revisa-tu-correo", <PaginaRevisaTuCorreo cliente={api} />, api);

    // La API responde igual exista o no el correo; la pantalla no puede saber
    // más que ella, así que no puede prometer una cuenta nueva.
    expect(screen.queryByText(/tu cuenta fue creada/i)).toBeNull();
    expect(screen.getByText(/si el correo no estaba registrado/i)).toBeInTheDocument();
  });
});

describe("Recuperar cuenta", () => {
  it("muestra el mismo aviso exista o no la cuenta", async () => {
    const api = crearClienteApi();
    sinSesion();
    renderizar("/recuperar-cuenta", <PaginaRecuperarCuenta cliente={api} />, api);

    vi.mocked(fetch).mockResolvedValue(json({ mensaje: "ok" }, 202));

    escribir(/correo/i, "nadie@ejemplo.cl");
    fireEvent.click(screen.getByRole("button", { name: /enviarme el enlace/i }));

    expect(await screen.findByText(/si el correo tiene una cuenta/i)).toBeInTheDocument();
  });
});

describe("Restablecer contraseña", () => {
  it("guarda la contraseña nueva y avisa que se cerraron las sesiones", async () => {
    const api = crearClienteApi();
    sinSesion();
    renderizar(
      "/restablecer-contrasena?token=abc123",
      <PaginaRestablecerContrasena cliente={api} />,
      api,
    );

    vi.mocked(fetch).mockResolvedValue(json({ mensaje: "ok" }));

    escribir(/^contraseña nueva$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña nueva$/i, "caballo-bateria-grapa");
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));

    // Texto exclusivo de la pantalla de éxito: "cerramos todas las sesiones"
    // también aparece en la introducción del formulario.
    expect(await screen.findByText(/tendrás que entrar de nuevo/i)).toBeInTheDocument();
  });

  it("aplica las reglas compartidas antes de gastar el enlace", async () => {
    const api = crearClienteApi();
    sinSesion();
    renderizar(
      "/restablecer-contrasena?token=abc123",
      <PaginaRestablecerContrasena cliente={api} />,
      api,
    );

    vi.mocked(fetch).mockClear();

    escribir(/^contraseña nueva$/i, "corta");
    escribir(/^repetir contraseña nueva$/i, "corta");
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));

    expect(await screen.findByText(/al menos 10 caracteres/i)).toBeInTheDocument();

    const envios = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/restablecer");

    expect(envios).toHaveLength(0);
  });
});

describe("Restablecer contraseña: repetición", () => {
  it("no gasta el enlace si las contraseñas no coinciden", async () => {
    const api = crearClienteApi();
    sinSesion();
    renderizar(
      "/restablecer-contrasena?token=abc123",
      <PaginaRestablecerContrasena cliente={api} />,
      api,
    );

    vi.mocked(fetch).mockClear();

    escribir(/^contraseña nueva$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña nueva$/i, "caballo-bateria-grapo");
    fireEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^repetir contraseña nueva$/i)).toHaveAttribute("aria-invalid", "true");

    const envios = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/restablecer");

    expect(envios).toHaveLength(0);
  });
});

describe("Cambiar contraseña", () => {
  function renderizarProtegida(api = crearClienteApi()) {
    return render(
      <MemoryRouter initialEntries={["/cambiar-contrasena"]}>
        <ProveedorAuth cliente={api}>
          <Routes>
            <Route
              path="/cambiar-contrasena"
              element={
                <RutaProtegida>
                  <PaginaCambiarContrasena cliente={api} />
                </RutaProtegida>
              }
            />
            <Route path="/iniciar-sesion" element={<p>Pantalla de inicio de sesión</p>} />
          </Routes>
        </ProveedorAuth>
      </MemoryRouter>,
    );
  }

  it("muestra el error de contraseña actual bajo su campo", async () => {
    const api = crearClienteApi();

    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/api/auth/refrescar"
        ? json({ accessToken: "t", usuario })
        : json(
            {
              error: {
                codigo: "CONTRASENA_ACTUAL_INCORRECTA",
                mensaje: "La contraseña actual no es correcta.",
              },
            },
            400,
          ),
    );

    renderizarProtegida(api);
    await screen.findByLabelText(/contraseña actual/i);

    escribir(/contraseña actual/i, "equivocada");
    escribir(/^contraseña nueva$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña nueva$/i, "caballo-bateria-grapa");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByText(/la contraseña actual no es correcta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña actual/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("confirma que la sesión actual sigue abierta", async () => {
    const api = crearClienteApi();

    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/api/auth/refrescar"
        ? json({ accessToken: "t", usuario })
        : json({ mensaje: "ok" }),
    );

    renderizarProtegida(api);
    await screen.findByLabelText(/contraseña actual/i);

    escribir(/contraseña actual/i, "contrasena-segura-123");
    escribir(/^contraseña nueva$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña nueva$/i, "caballo-bateria-grapa");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByText(/esta sigue abierta/i)).toBeInTheDocument();
  });

  it("rechaza una contraseña que contiene el correo, sin llamar al servidor", async () => {
    const api = crearClienteApi();

    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/api/auth/refrescar"
        ? json({ accessToken: "t", usuario })
        : json({ mensaje: "ok" }),
    );

    renderizarProtegida(api);
    await screen.findByLabelText(/contraseña actual/i);

    escribir(/contraseña actual/i, "contrasena-segura-123");
    // Contiene el correo completo. La parte local "ana" sola no bastaría: son
    // tres letras, y la regla ignora fragmentos tan cortos para no prohibir
    // palabras comunes.
    escribir(/^contraseña nueva$/i, "xx-ana@ejemplo.cl-yy");
    escribir(/^repetir contraseña nueva$/i, "xx-ana@ejemplo.cl-yy");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByText(/no puede contener tu correo/i)).toBeInTheDocument();

    const envios = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/cambiar-contrasena");

    expect(envios).toHaveLength(0);
  });

  it("no cambia la contraseña si la repetición no coincide", async () => {
    const api = crearClienteApi();

    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/api/auth/refrescar"
        ? json({ accessToken: "t", usuario })
        : json({ mensaje: "ok" }),
    );

    renderizarProtegida(api);
    await screen.findByLabelText(/contraseña actual/i);

    escribir(/contraseña actual/i, "contrasena-segura-123");
    escribir(/^contraseña nueva$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña nueva$/i, "caballo-bateria");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();

    const envios = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/cambiar-contrasena");

    expect(envios).toHaveLength(0);
  });
});
