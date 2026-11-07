import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import App from "../App";
import { ProveedorAuth } from "../auth/ContextoAuth";

const PRESTADOR = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };

function servicio(id: string, titulo: string, estado: string, visiblePublicamente: boolean) {
  return {
    id,
    titulo,
    descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
    precioDesde: null,
    precioHasta: null,
    unidadPrecio: null,
    estado,
    categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
    categoriaPersonalizada: null,
    imagenes: [],
    moderacion: null,
    visiblePublicamente,
  };
}

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

function simularApi(servicios: ReturnType<typeof servicio>[], requisitos: { codigo: string; mensaje: string }[] = []) {
  vi.mocked(fetch).mockImplementation(async (entrada) => {
    const url = String(entrada);
    if (url === "/api/auth/refrescar") return json({ accessToken: "t", usuario: PRESTADOR });
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/prestadores/yo") {
      return json({ perfil: { id: "perfil-1", descripcion: "Gasfíter.", telefono: "+56912345678", radioAtencionKm: 10, comuna: SANTIAGO, comunasAtencion: [SANTIAGO] } });
    }
    if (url === "/api/servicios/mios") return json({ servicios, requisitosPendientes: requisitos });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/mi/servicios"]}>
      <ProveedorAuth cliente={crearClienteApi()}>
        <App />
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

describe("«Ver publicación» en /mi/servicios", () => {
  it("aparece solo si el servicio es visible al público", async () => {
    simularApi([servicio("s1", "Gasfitería visible", "PUBLICADO", true)]);
    renderizar();

    const fila = await screen.findByRole("article", { name: "Gasfitería visible" });

    expect(within(fila).getByRole("link", { name: "Ver publicación" })).toHaveAttribute("href", "/servicios/s1");
    expect(within(fila).queryByText("No se ve en LocalCL.")).not.toBeInTheDocument();
  });

  it("publicado pero no visible (identidad revocada): sin enlace, con lo que falta", async () => {
    simularApi(
      [servicio("s1", "Gasfitería sin verificar", "PUBLICADO", false)],
      [{ codigo: "IDENTIDAD_NO_VERIFICADA", mensaje: "Verifica tu identidad: sube tu cédula." }],
    );
    renderizar();

    const fila = await screen.findByRole("article", { name: "Gasfitería sin verificar" });

    expect(within(fila).queryByRole("link", { name: "Ver publicación" })).not.toBeInTheDocument();
    expect(within(fila).getByText("No se ve en LocalCL.")).toBeInTheDocument();
    expect(within(fila).getByText(/está publicado, pero no aparece porque te falta/i)).toBeInTheDocument();
    expect(within(fila).getByText("Verifica tu identidad: sube tu cédula.")).toBeInTheDocument();
  });

  it("pausado: sin enlace, y explica que hay que publicarlo", async () => {
    simularApi([servicio("s1", "Gasfitería pausada", "PAUSADO", false)]);
    renderizar();

    const fila = await screen.findByRole("article", { name: "Gasfitería pausada" });

    expect(within(fila).queryByRole("link", { name: "Ver publicación" })).not.toBeInTheDocument();
    expect(within(fila).getByText(/está pausado\. publícalo/i)).toBeInTheDocument();
  });

  it("si la API no dice que es visible, no se ofrece el enlace", async () => {
    const sinDato = { ...servicio("s1", "Gasfitería sin dato", "PUBLICADO", true) } as Partial<ReturnType<typeof servicio>>;
    delete sinDato.visiblePublicamente;
    vi.mocked(fetch).mockImplementation(async (entrada) => {
      const url = String(entrada);
      if (url === "/api/auth/refrescar") return json({ accessToken: "t", usuario: PRESTADOR });
      if (url === "/api/prestadores/yo") {
        return json({ perfil: { id: "perfil-1", descripcion: "Gasfíter.", telefono: "+56912345678", radioAtencionKm: 10, comuna: SANTIAGO, comunasAtencion: [SANTIAGO] } });
      }
      if (url === "/api/servicios/mios") return json({ servicios: [sinDato], requisitosPendientes: [] });
      return json({}, 404);
    });
    renderizar();

    const fila = await screen.findByRole("article", { name: "Gasfitería sin dato" });

    expect(within(fila).queryByRole("link", { name: "Ver publicación" })).not.toBeInTheDocument();
  });
});
