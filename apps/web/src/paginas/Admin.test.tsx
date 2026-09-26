import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaAdmin from "./Admin";
import PaginaPerfil from "./Perfil";

const cliente = { id: "u1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE" };
const admin = { id: "u2", correo: "jefe@ejemplo.cl", nombre: "Jefa Admin", rol: "ADMINISTRADOR" };

function json(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

/** Sesión iniciada con el usuario indicado, y respuestas por ruta. */
function responder(usuario: unknown, resumen: Response | null) {
  vi.mocked(fetch).mockImplementation(async (url) => {
    const ruta = String(url);

    if (ruta === "/api/auth/refrescar") {
      return json({ accessToken: "token", usuario });
    }

    if (ruta === "/api/admin/resumen") {
      return resumen ?? json({ error: { codigo: "SIN_PERMISOS" } }, 403);
    }

    return json({ usuario });
  });
}

function renderizar(rutaInicial: string, api = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <ProveedorAuth cliente={api}>
        <Routes>
          <Route path="/iniciar-sesion" element={<p>Iniciar sesión</p>} />
          <Route
            path="/perfil"
            element={
              <RutaProtegida>
                <PaginaPerfil cliente={api} />
              </RutaProtegida>
            }
          />
          <Route
            path="/admin"
            element={
              <RutaProtegida>
                <PaginaAdmin cliente={api} />
              </RutaProtegida>
            }
          />
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

describe("Enlace al panel en el perfil", () => {
  it("no se le muestra a un cliente", async () => {
    responder(cliente, null);
    const api = crearClienteApi();
    renderizar("/perfil", api);

    // Se espera a que el perfil cargue, para no dar por ausente un enlace
    // que simplemente todavía no se había renderizado.
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /panel de administración/i })).toBeNull();
  });

  it("se le muestra a un administrador", async () => {
    responder(admin, null);
    const api = crearClienteApi();
    renderizar("/perfil", api);

    expect(await screen.findByText("Jefa Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /panel de administración/i })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});

describe("Panel de administración", () => {
  it("muestra los contadores que entrega la API", async () => {
    responder(
      admin,
      json({
        resumen: {
          totalUsuarios: 4,
          porRol: { CLIENTE: 2, PRESTADOR: 1, ADMINISTRADOR: 1 },
        },
      }),
    );

    const api = crearClienteApi();
    renderizar("/admin", api);

    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByText("CLIENTE")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("traduce el 403 del servidor a un aviso de falta de permisos", async () => {
    // Un cliente que escribe /admin a mano: la interfaz no lo bloquea, lo
    // bloquea la API y aquí solo se muestra su respuesta.
    responder(cliente, json({ error: { codigo: "SIN_PERMISOS" } }, 403));

    const api = crearClienteApi();
    renderizar("/admin", api);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tienes permisos/i);
  });
});
