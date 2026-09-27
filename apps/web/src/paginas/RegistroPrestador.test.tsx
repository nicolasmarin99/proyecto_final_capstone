import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import PaginaIniciarSesion from "./IniciarSesion";
import PaginaRegistroPrestador from "./RegistroPrestador";

const RUT_VALIDO = "12.345.678-5";

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

function renderizar(cliente = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={["/registro-prestador"]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/registro-prestador" element={<PaginaRegistroPrestador cliente={cliente} />} />
          <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function escribir(etiqueta: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

function completarFormulario(rut: string) {
  escribir(/^nombre$/i, "Pedro Soto");
  escribir(/^correo$/i, "pedro.soto@ejemplo.cl");
  escribir(/^rut$/i, rut);
  escribir(/^contraseña$/i, "contrasena-segura-123");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Registro de prestador", () => {
  it("crea la cuenta y lleva a iniciar sesión con el aviso de éxito", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizar(cliente);

    vi.mocked(fetch).mockResolvedValue(json({ usuario: {} }, 201));

    completarFormulario(RUT_VALIDO);
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    expect(await screen.findByText(/cuenta de prestador fue creada/i)).toBeInTheDocument();
  });

  it("envía el RUT ya normalizado al servidor", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizar(cliente);

    vi.mocked(fetch).mockResolvedValue(json({ usuario: {} }, 201));

    completarFormulario("12.345.678-5");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    await waitFor(() => {
      const envio = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => String(url) === "/api/auth/registro-prestador");

      expect(envio).toBeDefined();
      expect(String(envio?.[1]?.body)).toContain('"rut":"12345678-5"');
    });
  });

  it("muestra el RUT normalizado mientras se escribe", () => {
    sinSesion();
    renderizar();

    escribir(/^rut$/i, "12345678-5");

    expect(screen.getByText(/se guardará como 12345678-5/i)).toBeInTheDocument();
  });

  it("no muestra la vista previa si el RUT todavía no es válido", () => {
    sinSesion();
    renderizar();

    escribir(/^rut$/i, "12.345.678-9");

    expect(screen.queryByText(/se guardará como/i)).toBeNull();
  });

  it("marca el error bajo el campo RUT sin llamar al servidor", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizar(cliente);

    // Dígito verificador incorrecto: el 5 es el correcto para este cuerpo.
    completarFormulario("12.345.678-9");
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    expect(await screen.findByText(/el rut no es válido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^rut$/i)).toHaveAttribute("aria-invalid", "true");

    const enviados = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "/api/auth/registro-prestador");

    expect(enviados).toHaveLength(0);
  });

  it("muestra bajo el campo el error de RUT que devuelve la API", async () => {
    // Aunque el cliente valide, la API es la que manda: si responde con un
    // detalle en rut, se muestra igual.
    sinSesion();
    const cliente = crearClienteApi();
    renderizar(cliente);

    vi.mocked(fetch).mockResolvedValue(
      json(
        {
          error: {
            codigo: "DATOS_INVALIDOS",
            mensaje: "Los datos enviados no son válidos.",
            detalles: [{ campo: "rut", mensaje: "El RUT no es válido." }],
          },
        },
        400,
      ),
    );

    completarFormulario(RUT_VALIDO);
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    expect(await screen.findByText(/el rut no es válido/i)).toBeInTheDocument();
  });

  it("muestra el mensaje genérico cuando el correo o el RUT ya están registrados", async () => {
    sinSesion();
    const cliente = crearClienteApi();
    renderizar(cliente);

    vi.mocked(fetch).mockResolvedValue(
      json(
        {
          error: {
            codigo: "REGISTRO_NO_DISPONIBLE",
            mensaje: "No fue posible completar el registro con los datos entregados.",
          },
        },
        409,
      ),
    );

    completarFormulario(RUT_VALIDO);
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta de prestador/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no fue posible completar/i);
  });
});
