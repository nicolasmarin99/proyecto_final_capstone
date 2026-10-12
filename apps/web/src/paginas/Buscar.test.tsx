import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { ConEncabezado } from "../componentes/Encabezado";
import PaginaBuscar from "./Buscar";
import PaginaServicio from "./Servicio";

const REGION = { id: 13, nombre: "Metropolitana de Santiago", orden: 7 };
const COMUNAS = [
  { id: 13114, nombre: "Las Condes", region: REGION },
  { id: 13120, nombre: "Ñuñoa", region: REGION },
];

const RESULTADO = {
  id: "s1",
  titulo: "Gasfitería a domicilio",
  categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
  categoriaPersonalizada: null,
  precioDesde: null,
  precioHasta: null,
  unidadPrecio: null,
  aConvenir: true,
  prestador: {
    nombre: "Pedro Soto",
    comunas: [
      { id: 13114, nombre: "Las Condes" },
      { id: 13120, nombre: "Ñuñoa" },
      { id: 13123, nombre: "Providencia" },
    ],
    comunasRestantes: 2,
    acreditado: true,
  },
};

const SERVICIO_PUBLICO = {
  id: "s1",
  titulo: "Gasfitería a domicilio",
  descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
  precioDesde: null,
  precioHasta: null,
  unidadPrecio: null,
  categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
  categoriaPersonalizada: null,
  prestador: { id: "perfil-1", nombre: "Pedro Soto", comunas: [], credenciales: [] },
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

type Busqueda = (url: URL) => Response | Promise<Response>;

/** Simula la API. `busqueda` responde GET /servicios según la consulta recibida. */
function simularApi(busqueda: Busqueda = () => json({ resultados: [RESULTADO], pagina: 1, porPagina: 12, total: 1 })) {
  vi.mocked(fetch).mockImplementation(async (entrada) => {
    const url = new URL(String(entrada), "http://localhost");

    if (url.pathname === "/api/auth/refrescar") return json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    if (url.pathname === "/api/comunas") return json({ comunas: COMUNAS });
    if (url.pathname === "/api/categorias") {
      return json({ categorias: [{ slug: "gasfiteria", nombre: "Gasfitería" }, { slug: "electricidad", nombre: "Electricidad" }] });
    }
    if (url.pathname === "/api/servicios") return busqueda(url);
    if (url.pathname === "/api/servicios/s1") return json({ servicio: SERVICIO_PUBLICO });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

/** Consultas que llegaron a GET /servicios, en orden. */
function busquedas(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([entrada]) => String(entrada))
    .filter((url) => url === "/api/servicios" || url.startsWith("/api/servicios?"));
}

/** Muestra la URL actual y permite ir atrás, como el botón del navegador. */
function Ubicacion() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  return (
    <>
      <p data-testid="ubicacion">{pathname + search}</p>
      <button type="button" onClick={() => navegar(-1)}>
        Atrás del navegador
      </button>
    </>
  );
}

function renderizar(...entradas: string[]) {
  return render(
    <MemoryRouter initialEntries={entradas} initialIndex={entradas.length - 1}>
      <ProveedorAuth cliente={crearClienteApi()}>
        <Routes>
          <Route element={<ConEncabezado />}>
            <Route path="/buscar" element={<PaginaBuscar />} />
            <Route path="/servicios/:id" element={<PaginaServicio />} />
          </Route>
        </Routes>
        <Ubicacion />
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

const ubicacion = () => screen.getByTestId("ubicacion").textContent;

/** El formulario está listo cuando llegaron las comunas al selector. */
async function esperarFormulario() {
  await within(screen.getByRole("search")).findByRole("option", { name: "Las Condes" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Filtros en la URL", () => {
  it("al buscar, los filtros pasan a la URL y la consulta usa esos mismos parámetros", async () => {
    simularApi();
    renderizar("/buscar");
    await esperarFormulario();

    const formulario = screen.getByRole("search");
    fireEvent.change(within(formulario).getByLabelText("¿Qué necesitas?"), { target: { value: "gasfiter" } });
    fireEvent.change(within(formulario).getByLabelText("Comuna"), { target: { value: "13114" } });
    fireEvent.change(within(formulario).getByLabelText("Categoría"), { target: { value: "gasfiteria" } });
    fireEvent.change(within(formulario).getByLabelText("Precio máximo"), { target: { value: "50000" } });
    fireEvent.change(within(formulario).getByLabelText("Ordenar por"), { target: { value: "precio" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Buscar" }));

    const esperada = "?q=gasfiter&categoria=gasfiteria&comuna=13114&precioMax=50000&orden=precio";
    await waitFor(() => expect(ubicacion()).toBe(`/buscar${esperada}`));
    await waitFor(() => expect(busquedas()).toContain(`/api/servicios${esperada}`));
  });

  it("una URL compartida arma el formulario y la búsqueda", async () => {
    simularApi();
    renderizar("/buscar?q=gasfiter&comuna=13114");
    await esperarFormulario();

    const formulario = screen.getByRole("search");
    expect(within(formulario).getByLabelText("¿Qué necesitas?")).toHaveValue("gasfiter");
    expect(within(formulario).getByLabelText("Comuna")).toHaveValue("13114");
    expect(busquedas()).toContain("/api/servicios?q=gasfiter&comuna=13114");
    // Los filtros activos se muestran con nombre, no con el código.
    expect(screen.getByRole("link", { name: "Quitar filtro: Las Condes" })).toHaveAttribute("href", "/buscar?q=gasfiter");
  });

  it("el botón atrás vuelve a la búsqueda anterior", async () => {
    simularApi();
    renderizar("/buscar?q=gasfiter");
    await esperarFormulario();

    fireEvent.change(screen.getByLabelText("¿Qué necesitas?"), { target: { value: "enchufes" } });
    fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(ubicacion()).toBe("/buscar?q=enchufes"));

    fireEvent.click(screen.getByRole("button", { name: "Atrás del navegador" }));

    await waitFor(() => expect(ubicacion()).toBe("/buscar?q=gasfiter"));
    await waitFor(() => expect(screen.getByLabelText("¿Qué necesitas?")).toHaveValue("gasfiter"));
    expect(busquedas().at(-1)).toBe("/api/servicios?q=gasfiter");
  });

  it("ignora en la URL los valores mal formados en vez de romperse", async () => {
    simularApi();
    renderizar("/buscar?comuna=abc&orden=azar&pagina=-3&q=gasfiter");

    await screen.findByRole("link", { name: "Gasfitería a domicilio" });
    expect(busquedas()).toEqual(["/api/servicios?q=gasfiter"]);
  });
});

describe("Resultados", () => {
  it("cada tarjeta lleva a la página del servicio", async () => {
    simularApi();
    renderizar("/buscar?q=gasfiter");

    const tarjeta = await screen.findByRole("link", { name: "Gasfitería a domicilio" });
    expect(tarjeta).toHaveAttribute("href", "/servicios/s1");
    expect(tarjeta).toHaveAccessibleDescription(/a convenir/i);
    expect(within(tarjeta).getByText("Certificación oficial")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Atiende en Las Condes, Ñuñoa, Providencia y 2 más")).toBeInTheDocument();

    fireEvent.click(tarjeta);

    expect(await screen.findByRole("heading", { level: 1, name: "Gasfitería a domicilio" })).toBeInTheDocument();
    expect(ubicacion()).toBe("/servicios/s1");
  });

  it("anuncia cuántos encontró", async () => {
    simularApi();
    renderizar("/buscar");

    expect(await screen.findByText("1 servicio encontrado")).toBeInTheDocument();
  });

  it("pagina con enlaces que conservan los filtros", async () => {
    simularApi((url) =>
      json({ resultados: [RESULTADO], pagina: Number(url.searchParams.get("pagina") ?? 1), porPagina: 12, total: 30 }),
    );
    renderizar("/buscar?q=gasfiter");

    const paginacion = await screen.findByRole("navigation", { name: "Paginación" });
    expect(within(paginacion).getByText("Página 1 de 3")).toBeInTheDocument();
    fireEvent.click(within(paginacion).getByRole("link", { name: "Siguiente" }));

    await waitFor(() => expect(ubicacion()).toBe("/buscar?q=gasfiter&pagina=2"));
    expect(busquedas().at(-1)).toBe("/api/servicios?q=gasfiter&pagina=2");
    // La barra se vuelve a montar con los resultados nuevos.
    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    const nueva = screen.getByRole("navigation", { name: "Paginación" });
    expect(within(nueva).getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/buscar?q=gasfiter");
  });
});

describe("Estados", () => {
  it("mientras busca, lo dice", async () => {
    let responder: (respuesta: Response) => void = () => undefined;
    simularApi(() => new Promise<Response>((resolver) => (responder = resolver)));
    renderizar("/buscar");

    expect(await screen.findByText("Buscando servicios…")).toBeInTheDocument();
    responder(json({ resultados: [], pagina: 1, porPagina: 12, total: 0 }));
    await waitFor(() => expect(screen.queryByText("Buscando servicios…")).not.toBeInTheDocument());
  });

  it("sin resultados en una comuna, sugiere quitar ese filtro", async () => {
    simularApi(() => json({ resultados: [], pagina: 1, porPagina: 12, total: 0 }));
    renderizar("/buscar?q=gasfiter&comuna=13114");

    expect(await screen.findByRole("heading", { name: "No encontramos servicios en Las Condes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar en todas las comunas" })).toHaveAttribute("href", "/buscar?q=gasfiter");
    expect(screen.getByRole("link", { name: "Buscar sin «gasfiter»" })).toHaveAttribute("href", "/buscar?comuna=13114");
  });

  it("sin resultados y sin comuna, ofrece quitar los otros filtros", async () => {
    simularApi(() => json({ resultados: [], pagina: 1, porPagina: 12, total: 0 }));
    renderizar("/buscar?categoria=electricidad&precioMax=1000");

    expect(await screen.findByRole("heading", { name: "No encontramos servicios con esos filtros" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitar Electricidad" })).toHaveAttribute("href", "/buscar?precioMax=1000");
    expect(screen.getByRole("link", { name: /quitar hasta/i })).toHaveAttribute("href", "/buscar?categoria=electricidad");
  });

  it("si falla la red, lo dice y permite reintentar", async () => {
    let fallar = true;
    simularApi(() => {
      if (fallar) throw new TypeError("Failed to fetch");
      return json({ resultados: [RESULTADO], pagina: 1, porPagina: 12, total: 1 });
    });
    renderizar("/buscar?q=gasfiter");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/no pudimos hacer la búsqueda/i);

    fallar = false;
    fireEvent.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("link", { name: "Gasfitería a domicilio" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
