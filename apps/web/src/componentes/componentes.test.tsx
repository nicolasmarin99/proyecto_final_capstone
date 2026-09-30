import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Boton } from "./Boton";
import { CampoTexto } from "./CampoTexto";
import { Revelar } from "./Revelar";

describe("Boton", () => {
  it("mientras carga queda deshabilitado y lo anuncia", () => {
    render(<Boton cargando>Entrando…</Boton>);
    const boton = screen.getByRole("button", { name: /entrando/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
  });

  it("sin carga no marca aria-busy", () => {
    render(<Boton>Entrar</Boton>);
    expect(screen.getByRole("button", { name: "Entrar" })).not.toHaveAttribute("aria-busy");
  });
});

/** CampoTexto es controlado: este envoltorio le da estado para poder escribir. */
function CampoContrasena({ valido }: { valido?: string }) {
  const [valor, setValor] = useState("");
  return (
    <CampoTexto
      id="clave"
      etiqueta="Contraseña"
      tipo="password"
      autoComplete="new-password"
      valor={valor}
      alCambiar={setValor}
      valido={valido}
    />
  );
}

describe("CampoTexto de contraseña", () => {
  it("permite mostrar y volver a ocultar lo escrito", () => {
    render(<CampoContrasena />);
    const campo = screen.getByLabelText("Contraseña");
    expect(campo).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(campo).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(campo).toHaveAttribute("type", "password");
  });

  it("el botón de mostrar no roba la etiqueta del campo", () => {
    render(<CampoContrasena />);
    // Si el botón usara aria-label, /contraseña/ encontraría dos elementos.
    expect(screen.getAllByLabelText(/contraseña/i)).toHaveLength(1);
  });

  it("muestra el mensaje de validez cuando se lo pasan", () => {
    render(<CampoContrasena valido="Las contraseñas coinciden." />);
    expect(screen.getByText("Las contraseñas coinciden.")).toBeInTheDocument();
  });
});

describe("Revelar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin IntersectionObserver deja el contenido visible", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Revelar>Contenido</Revelar>);
    expect(screen.getByText("Contenido")).not.toHaveAttribute("data-revelar", "pendiente");
  });

  it("espera a entrar en pantalla y entonces se muestra", () => {
    let avisar: (entradas: Partial<IntersectionObserverEntry>[]) => void = () => {};
    const desconectar = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof avisar) {
          avisar = callback;
        }
        observe() {}
        disconnect = desconectar;
      },
    );

    render(<Revelar>Contenido</Revelar>);
    const elemento = screen.getByText("Contenido");
    expect(elemento).toHaveAttribute("data-revelar", "pendiente");

    act(() => avisar([{ isIntersecting: true }]));
    expect(elemento).toHaveAttribute("data-revelar", "visible");
    // Aparece una sola vez: después deja de observar.
    expect(desconectar).toHaveBeenCalled();
  });
});
