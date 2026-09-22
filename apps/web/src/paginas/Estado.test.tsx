import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaginaEstado from "./Estado";

function respuestaJson(cuerpo: unknown, ok: boolean, status: number): Response {
  return {
    ok,
    status,
    json: async () => cuerpo,
  } as Response;
}

function renderizar() {
  return render(
    <MemoryRouter>
      <PaginaEstado />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Página de estado", () => {
  it("consulta la API por una ruta relativa que resuelve el proxy", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuestaJson({ estado: "ok", baseDatos: "ok", entorno: "development" }, true, 200),
    );

    renderizar();
    await screen.findByText(/todo ok/i);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/health");
  });

  it("muestra un estado de carga mientras espera la respuesta de la API", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it("muestra que todo está OK cuando la API responde 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuestaJson({ estado: "ok", baseDatos: "ok", entorno: "development" }, true, 200),
    );

    renderizar();

    expect(await screen.findByText(/todo ok/i)).toBeInTheDocument();
    expect(screen.getByText(/development/i)).toBeInTheDocument();
  });

  it("muestra degradado cuando la API responde 503 con la base caída", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuestaJson({ estado: "degradado", baseDatos: "sin conexión" }, false, 503),
    );

    renderizar();

    expect(await screen.findByText(/servicio degradado/i)).toBeInTheDocument();
  });

  it("muestra sin conexión cuando falla la red", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    renderizar();

    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument();
  });

  it("avisa que el servidor se está despertando tras 5 segundos de espera", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.queryByText(/despertando/i)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/despertando/i)).toBeInTheDocument();
  });

  it("se rinde a los 70 segundos y pasa a sin conexión", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const señal = (init as RequestInit).signal;
          señal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    renderizar();

    await act(async () => {
      vi.advanceTimersByTime(70000);
    });

    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it("permite reintentar tras un error", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    renderizar();
    await screen.findByText(/sin conexión/i);

    vi.mocked(fetch).mockResolvedValue(
      respuestaJson({ estado: "ok", baseDatos: "ok", entorno: "development" }, true, 200),
    );

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText(/todo ok/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
