import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth, useAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaPerfil from "./Perfil";
import PaginaRegistroPrestador from "./RegistroPrestador";

/*
  Una persona con cuenta de cliente quiere ofrecer servicios con el mismo
  correo: desde su perfil convierte su cuenta en una de prestador.
*/

const CLIENTE = { id: "u1", correo: "ana@ejemplo.cl", nombre: "Ana Rojas", rol: "CLIENTE", correoVerificado: true, rut: null, rutVerificado: false };

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

function simularApi(opciones: { usuario?: typeof CLIENTE; conversion?: Response } = {}) {
  const usuario = opciones.usuario ?? CLIENTE;
  vi.mocked(fetch).mockImplementation(async (entrada) => {
    const url = String(entrada);
    if (url === "/api/auth/refrescar") return json({ accessToken: "token-cliente", usuario });
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/auth/convertir-en-prestador") {
      return opciones.conversion ?? json({ accessToken: "token-prestador", usuario: { ...usuario, rol: "PRESTADOR", rut: "12345678-5" } });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url]) => patron.test(String(url)));
}

/** Muestra dónde quedó la navegación y el rol de la sesión. */
function Destino() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  return (
    <p data-testid="destino">
      {pathname} · {usuario?.rol ?? "sin sesión"}
    </p>
  );
}

function renderizar(ruta: string) {
  const cliente = crearClienteApi();
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/perfil" element={<RutaProtegida><PaginaPerfil cliente={cliente} /></RutaProtegida>} />
          <Route path="/registro-prestador" element={<PaginaRegistroPrestador cliente={cliente} />} />
          <Route path="/mi/perfil" element={<Destino />} />
          <Route path="/iniciar-sesion" element={<p>Iniciar sesión</p>} />
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

async function abrirFormulario() {
  const seccion = await screen.findByRole("region", { name: "¿Ofreces servicios?" });
  fireEvent.click(within(seccion).getByRole("button", { name: "Quiero ofrecer mis servicios" }));
  return seccion;
}

describe("Convertir la cuenta de cliente en prestador", () => {
  it("el perfil de un cliente ofrece convertir su cuenta y explica qué conserva y qué cambia", async () => {
    simularApi();
    renderizar("/perfil");

    const seccion = await abrirFormulario();

    expect(within(seccion).getByText(/no necesitas otra cuenta/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/conservas tu historial/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/tendrás que verificar tu identidad con tu cédula/i)).toBeInTheDocument();
    expect(within(seccion).getByLabelText("Tu RUT")).toBeInTheDocument();
  });

  it("con un RUT válido convierte la cuenta, usa la sesión nueva y lleva al área de prestador", async () => {
    simularApi();
    renderizar("/perfil");
    const seccion = await abrirFormulario();

    fireEvent.change(within(seccion).getByLabelText("Tu RUT"), { target: { value: "12.345.678-5" } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Convertir mi cuenta" }));

    await waitFor(() => expect(screen.getByTestId("destino")).toHaveTextContent("/mi/perfil · PRESTADOR"));
    const [llamada] = llamadas(/\/api\/auth\/convertir-en-prestador$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ rut: "12.345.678-5" });
    expect(new Headers(llamada?.[1]?.headers).get("Authorization")).toBe("Bearer token-cliente");
  });

  it("un RUT con el dígito verificador equivocado se avisa sin llamar a la API", async () => {
    simularApi();
    renderizar("/perfil");
    const seccion = await abrirFormulario();

    fireEvent.change(within(seccion).getByLabelText("Tu RUT"), { target: { value: "12.345.678-0" } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Convertir mi cuenta" }));

    expect(await within(seccion).findByText(/dígito verificador no coincide/i)).toBeInTheDocument();
    expect(llamadas(/convertir-en-prestador/)).toHaveLength(0);
  });

  it("si el RUT ya está en otra cuenta, lo dice bajo el campo y la cuenta sigue siendo de cliente", async () => {
    simularApi({
      conversion: json(
        { error: { codigo: "RUT_EN_USO", mensaje: "Ese RUT ya está asociado a otra cuenta de LocalCL.", detalles: [{ campo: "rut", mensaje: "Ese RUT ya está asociado a otra cuenta. Si es tuyo, escríbenos para revisarlo." }] } },
        409,
      ),
    });
    renderizar("/perfil");
    const seccion = await abrirFormulario();

    fireEvent.change(within(seccion).getByLabelText("Tu RUT"), { target: { value: "12.345.678-5" } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Convertir mi cuenta" }));

    expect(await within(seccion).findByText(/ya está asociado a otra cuenta/i)).toBeInTheDocument();
    expect(screen.queryByTestId("destino")).not.toBeInTheDocument();
  });

  it("sin el correo confirmado no ofrece convertir: primero hay que confirmarlo", async () => {
    simularApi({ usuario: { ...CLIENTE, correoVerificado: false } });
    renderizar("/perfil");

    const seccion = await screen.findByRole("region", { name: "¿Ofreces servicios?" });

    expect(within(seccion).getByText(/primero confirma tu correo/i)).toBeInTheDocument();
    expect(within(seccion).queryByRole("button", { name: "Quiero ofrecer mis servicios" })).not.toBeInTheDocument();
  });

  it("a un prestador no se le ofrece (ya lo es)", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "PRESTADOR" } });
    renderizar("/perfil");

    await screen.findByText("Ana Rojas");

    expect(screen.queryByRole("region", { name: "¿Ofreces servicios?" })).not.toBeInTheDocument();
  });

  it("en el registro de prestador, a quien ya tiene sesión de cliente lo lleva a convertirla desde su perfil", async () => {
    simularApi();
    renderizar("/registro-prestador");

    const enlace = await screen.findByRole("link", { name: "Conviértela desde tu perfil" });
    expect(enlace).toHaveAttribute("href", "/perfil");
  });

  it("el registro de prestador avisa que con una cuenta de cliente no hace falta crear otra", async () => {
    // Sin sesión: la API no restaura ninguna.
    vi.mocked(fetch).mockImplementation(async () => json({ error: { codigo: "SESION_INVALIDA" } }, 401));
    renderizar("/registro-prestador");

    expect(await screen.findByText(/¿Ya tienes cuenta de cliente\? No necesitas otra/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "inicia sesión" })).toHaveAttribute("href", "/iniciar-sesion");
  });
});
