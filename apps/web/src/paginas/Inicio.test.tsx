import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularEtapa, calcularProgreso } from "../componentes/landing/useEtapaScroll";
import { rutaBuscar } from "../servicios/filtrosBusqueda";
import PaginaInicio from "./Inicio";

const COMUNAS = [
  { id: 13120, nombre: "Ñuñoa", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } },
  { id: 13119, nombre: "Maipú", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } },
];

// El buscador de la portada pide las comunas para traducir el nombre escrito a su código.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) =>
      String(entrada) === "/api/comunas"
        ? ({ ok: true, status: 200, json: async () => ({ comunas: COMUNAS }) } as Response)
        : ({ ok: false, status: 404, json: async () => ({}) } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Muestra la dirección a la que se navegó, para comprobarla en la prueba. */
function Destino() {
  const { pathname, search } = useLocation();
  return <p data-testid="destino">{pathname + search}</p>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<PaginaInicio />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("calcularEtapa", () => {
  it("respeta los umbrales del diseño", () => {
    expect(calcularEtapa(0)).toBe(0);
    expect(calcularEtapa(0.339)).toBe(0);
    expect(calcularEtapa(0.34)).toBe(1);
    expect(calcularEtapa(0.719)).toBe(1);
    expect(calcularEtapa(0.72)).toBe(2);
    expect(calcularEtapa(1)).toBe(2);
  });
});

describe("calcularProgreso", () => {
  // Sección de 2400px con un bloque fijo de 800px: hay 1600px de recorrido.
  it("vale 0 mientras la sección no llega arriba", () => {
    expect(calcularProgreso(300, 2400, 800)).toBe(0);
  });

  it("avanza en proporción al recorrido", () => {
    expect(calcularProgreso(-800, 2400, 800)).toBe(0.5);
  });

  it("no pasa de 1 cuando la sección ya se fue", () => {
    expect(calcularProgreso(-5000, 2400, 800)).toBe(1);
  });

  it("no divide por cero si el bloque fijo mide lo mismo que la sección", () => {
    expect(Number.isFinite(calcularProgreso(-10, 800, 800))).toBe(true);
  });
});

describe("rutaBuscar", () => {
  it("arma los parámetros y omite los vacíos", () => {
    expect(rutaBuscar({ q: "Gasfitería", comuna: 13119 })).toBe("/buscar?q=Gasfiter%C3%ADa&comuna=13119");
    expect(rutaBuscar({ q: "  " })).toBe("/buscar");
  });
});

describe("PaginaInicio", () => {
  it("muestra el titular y las secciones", () => {
    renderizar();
    expect(
      screen.getByRole("heading", { level: 1, name: "Encuentra al experto que tu hogar necesita." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resuelve en tres pasos" })).toBeInTheDocument();
    expect(screen.getAllByText("LocalCL").length).toBeGreaterThan(0);
  });

  // La barra con «Iniciar sesión» ahora es el encabezado global: se prueba
  // en Navegacion.test.tsx. La portada sigue llevando al registro de prestador.
  it("la portada lleva al registro de prestador", () => {
    renderizar();
    const enlaces = screen.getAllByRole("link", { name: "Publicar mi servicio" });
    expect(enlaces).toHaveLength(2);
    for (const enlace of enlaces) expect(enlace).toHaveAttribute("href", "/registro-prestador");
  });

  it("los campos del buscador tienen etiqueta", () => {
    renderizar();
    expect(screen.getByLabelText("Servicio")).toBeInTheDocument();
    expect(screen.getByLabelText("Comuna")).toBeInTheDocument();
  });

  // La comuna escrita viaja como su código: la búsqueda filtra por id.
  it("el buscador navega a /buscar con lo escrito", async () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Servicio"), { target: { value: "gasfiter" } });
    fireEvent.change(screen.getByLabelText("Comuna"), { target: { value: "Ñuñoa" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByTestId("destino")).toHaveTextContent("/buscar?q=gasfiter&comuna=13120");
  });

  it("reconoce la comuna sin tildes ni mayúsculas", async () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Comuna"), { target: { value: "  MAIPU " } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByTestId("destino")).toHaveTextContent("/buscar?comuna=13119");
  });

  it("si la comuna no existe, lo dice y no navega", async () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Comuna"), { target: { value: "Gotham" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText(/no encontramos esa comuna/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Comuna")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("destino")).not.toBeInTheDocument();
  });

  it("las categorías populares llevan a /buscar filtrado por categoría", () => {
    renderizar();
    expect(screen.getAllByRole("link", { name: "Gasfitería" })[0]).toHaveAttribute("href", "/buscar?categoria=gasfiteria");
  });
});
