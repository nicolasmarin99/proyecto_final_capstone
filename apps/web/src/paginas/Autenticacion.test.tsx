import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaIniciarSesion from "./IniciarSesion";
import PaginaPerfil from "./Perfil";
import PaginaRegistro from "./Registro";

const usuario = { id: "u1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE" };

function json(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

/** Sin sesión previa: el refresco de arranque falla, como en un navegador nuevo. */
function sinSesion() {
  vi.mocked(fetch).mockResolvedValue(json({ error: { codigo: "SESION_INVALIDA" } }, 401));
}

function renderizarApp(rutaInicial: string, cliente = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/" element={<p>Página de estado</p>} />
          <Route path="/registro" element={<PaginaRegistro cliente={cliente} />} />
          <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
          <Route path="/revisa-tu-correo" element={<p>Revisa tu correo</p>} />
          <Route
            path="/perfil"
            element={
              <RutaProtegida>
                <PaginaPerfil cliente={cliente} />
              </RutaProtegida>
            }
          />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

/** Peticiones de registro que llegaron a salir hacia la API. */
function registrosEnviados() {
  return vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/auth/registro");
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

describe("Formulario de registro", () => {
  it("crea la cuenta y lleva a la pantalla de revisar el correo", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockResolvedValue(json({ mensaje: "Si el correo no estaba registrado, te enviamos un enlace para confirmarlo." }, 202));

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/revisa tu correo/i)).toBeInTheDocument();
  });

  it("muestra los errores de validación junto al campo que los provocó", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockResolvedValue(
      json(
        {
          error: {
            codigo: "DATOS_INVALIDOS",
            mensaje: "Los datos enviados no son válidos.",
            detalles: [
              { campo: "contrasena", mensaje: "La contraseña debe tener al menos 10 caracteres." },
              { campo: "correo", mensaje: "Debe ser un correo electrónico válido." },
            ],
          },
        },
        400,
      ),
    );

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "no-es-correo");
    // Contraseña que pasa la revisión del cliente, para que la petición llegue
    // a la API y se pueda comprobar que sus detalles se muestran por campo.
    escribir(/^contraseña$/i, "caballo-bateria-grapa");
    escribir(/^repetir contraseña$/i, "caballo-bateria-grapa");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument();

    // El mensaje queda enlazado al campo mediante aria-describedby.
    expect(screen.getByLabelText(/^contraseña$/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("aplica las reglas compartidas antes de llamar al servidor", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockClear();

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana.perez@ejemplo.cl");
    // Contiene la parte local del correo: lo rechaza @localcl/shared, la misma
    // función que usa la API.
    escribir(/^contraseña$/i, "ana.perez-2026-clave");
    escribir(/^repetir contraseña$/i, "ana.perez-2026-clave");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText(/no puede contener tu correo/i)).toBeInTheDocument();

    const enviados = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/registro");

    expect(enviados).toHaveLength(0);
  });

  it("deshabilita el botón mientras la petición está en curso", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /creando cuenta/i })).toBeDisabled();
    });
  });

  it("no crea la cuenta si las contraseñas no coinciden", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockClear();

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-124");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^repetir contraseña$/i)).toHaveAttribute("aria-invalid", "true");
    expect(registrosEnviados()).toHaveLength(0);
  });

  it("pide repetir la contraseña si ese campo queda vacío", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockClear();

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Repite tu contraseña.")).toBeInTheDocument();
    expect(registrosEnviados()).toHaveLength(0);
  });

  it("confirma en vivo cuando la contraseña cumple las reglas y cuando coincide", async () => {
    sinSesion();
    renderizarApp("/registro");

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    expect(screen.queryByText("Cumple los requisitos.")).not.toBeInTheDocument();

    escribir(/^contraseña$/i, "contrasena-segura-123");
    expect(await screen.findByText("Cumple los requisitos.")).toBeInTheDocument();

    // A medio escribir la repetición todavía no coincide: no se confirma nada.
    escribir(/^repetir contraseña$/i, "contrasena");
    expect(screen.queryByText("Las contraseñas coinciden.")).not.toBeInTheDocument();

    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    expect(screen.getByText("Las contraseñas coinciden.")).toBeInTheDocument();
  });

  it("no confirma una contraseña que contiene el correo", async () => {
    sinSesion();
    renderizarApp("/registro");

    escribir(/correo/i, "ana.perez@ejemplo.cl");
    escribir(/^contraseña$/i, "ana.perez-2026-clave");
    expect(screen.queryByText("Cumple los requisitos.")).not.toBeInTheDocument();
  });

  it("no envía la repetición al servidor: solo sirve en el formulario", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/registro", cliente);

    vi.mocked(fetch).mockResolvedValue(json({ mensaje: "Te enviamos un enlace." }, 202));

    escribir(/nombre/i, "Ana Pérez");
    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/^contraseña$/i, "contrasena-segura-123");
    escribir(/^repetir contraseña$/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await screen.findByText(/revisa tu correo/i);
    const [, opciones] = registrosEnviados()[0]!;
    expect(JSON.parse(String(opciones?.body))).toEqual({
      nombre: "Ana Pérez",
      correo: "ana@ejemplo.cl",
      contrasena: "contrasena-segura-123",
    });
  });
});

describe("Formulario de inicio de sesión", () => {
  it("muestra un mensaje genérico cuando las credenciales no sirven", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/iniciar-sesion", cliente);

    vi.mocked(fetch).mockResolvedValue(
      json(
        { error: { codigo: "CREDENCIALES_INVALIDAS", mensaje: "Correo o contraseña incorrectos." } },
        401,
      ),
    );

    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/contraseña/i, "equivocada");
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/correo o contraseña incorrectos/i);
  });

  it("usa los atributos de accesibilidad y autocompletado correctos", async () => {
    sinSesion();
    renderizarApp("/iniciar-sesion");

    const correo = screen.getByLabelText(/correo/i);
    const contrasena = screen.getByLabelText(/contraseña/i);

    expect(correo).toHaveAttribute("autocomplete", "username");
    expect(contrasena).toHaveAttribute("type", "password");
    expect(contrasena).toHaveAttribute("autocomplete", "current-password");
  });

  it("entra y lleva al perfil cuando las credenciales son correctas", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizarApp("/iniciar-sesion", cliente);

    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ accessToken: "token-1", usuario }))
      .mockResolvedValue(json({ usuario }));

    escribir(/correo/i, "ana@ejemplo.cl");
    escribir(/contraseña/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("CLIENTE")).toBeInTheDocument();
  });
});

describe("Ruta protegida", () => {
  it("redirige a iniciar sesión cuando no hay sesión", async () => {
    sinSesion();
    renderizarApp("/perfil");

    expect(await screen.findByRole("button", { name: /entrar/i })).toBeInTheDocument();
    expect(screen.queryByText(/mi perfil/i)).not.toBeInTheDocument();
  });

  it("no redirige mientras todavía se está restaurando la sesión", async () => {
    // Si redirigiera antes de saber el resultado, recargar /perfil con una
    // cookie válida expulsaría al usuario a iniciar sesión.
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderizarApp("/perfil");

    expect(screen.getByText(/verificando tu sesión/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entrar/i })).not.toBeInTheDocument();
  });
});

describe("Restauración de sesión", () => {
  it("recupera la sesión con la cookie y permite entrar al perfil tras recargar", async () => {
    const cliente = crearClienteApi();

    // Al arrancar, el refresco devuelve sesión; luego /auth/yo entrega el perfil.
    vi.mocked(fetch).mockImplementation(async (url) => {
      const ruta = String(url);

      if (ruta === "/api/auth/refrescar") {
        return json({ accessToken: "token-restaurado", usuario });
      }

      return json({ usuario });
    });

    renderizarApp("/perfil", cliente);

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("ana@ejemplo.cl")).toBeInTheDocument();
  });

  it("cierra la sesión y vuelve a la página de estado", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch).mockImplementation(async (url) => {
      const ruta = String(url);

      if (ruta === "/api/auth/refrescar") {
        return json({ accessToken: "token-restaurado", usuario });
      }

      if (ruta === "/api/auth/logout") {
        return json(null, 204);
      }

      return json({ usuario });
    });

    renderizarApp("/perfil", cliente);
    await screen.findByText("Ana Pérez");

    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(await screen.findByText(/página de estado/i)).toBeInTheDocument();
  });
});
