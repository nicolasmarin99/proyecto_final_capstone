import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { rutaBusqueda } from "../componentes/landing/datos";
import { calcularEtapa, calcularProgreso } from "../componentes/landing/useEtapaScroll";
import PaginaInicio from "./Inicio";

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

describe("rutaBusqueda", () => {
  it("arma los parámetros y omite los vacíos", () => {
    expect(rutaBusqueda("Gasfitería", "Maipú")).toBe("/buscar?servicio=Gasfiter%C3%ADa&comuna=Maip%C3%BA");
    expect(rutaBusqueda("  ", "")).toBe("/buscar");
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

  it("los botones de la barra llevan a iniciar sesión y al registro de prestador", () => {
    renderizar();
    const barra = screen.getByRole("banner");
    expect(within(barra).getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/iniciar-sesion",
    );
    expect(within(barra).getByRole("link", { name: "Publica tu servicio" })).toHaveAttribute(
      "href",
      "/registro-prestador",
    );
  });

  it("los campos del buscador tienen etiqueta", () => {
    renderizar();
    expect(screen.getByLabelText("Servicio")).toBeInTheDocument();
    expect(screen.getByLabelText("Comuna")).toBeInTheDocument();
  });

  it("el buscador navega a /buscar con lo escrito", () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Servicio"), { target: { value: "gasfiter" } });
    fireEvent.change(screen.getByLabelText("Comuna"), { target: { value: "Ñuñoa" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/buscar?servicio=gasfiter&comuna=%C3%91u%C3%B1oa");
  });

  it("el menú móvil se abre y se cierra con Escape", () => {
    renderizar();
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });
});
