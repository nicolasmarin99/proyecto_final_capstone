import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import PaginaPerfil from "./Perfil";

const CLIENTE = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true };

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

function contratacion(extra: object = {}) {
  return {
    id: "k1",
    fechaContratacion: "2026-11-10",
    notas: "Cobró $35.000 por todo el jardín.",
    servicio: { id: "s1", titulo: "Mantención de jardines", disponible: true },
    prestador: { nombre: "Pedro Soto" },
    valoracion: null,
    ...extra,
  };
}

function simularApi({ usuario = CLIENTE, contrataciones = [contratacion()], total }: { usuario?: object; contrataciones?: object[]; total?: number } = {}) {
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";
    if (url === "/api/auth/refrescar") return json({ accessToken: "t", usuario });
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/cuenta/foto") return json({ foto: null, retirada: null });
    if (url.startsWith("/api/contrataciones?")) {
      return json({ contrataciones, pagina: 1, porPagina: 10, total: total ?? contrataciones.length });
    }
    if (/^\/api\/contrataciones\/[^/]+$/.test(url) && metodo === "PATCH") {
      const cambios = JSON.parse(String(opciones?.body)) as object;
      return json({ contratacion: contratacion(cambios) });
    }
    if (/^\/api\/contrataciones\/[^/]+$/.test(url) && metodo === "DELETE") {
      return { ok: true, status: 204, json: async () => null } as Response;
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar() {
  const api = crearClienteApi();
  return render(
    <MemoryRouter initialEntries={["/perfil"]}>
      <ProveedorAuth cliente={api}>
        <Routes>
          <Route path="/perfil" element={<PaginaPerfil cliente={api} />} />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

const seccion = () => screen.findByRole("region", { name: "Servicios contratados" });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Servicios contratados, en Mi perfil", () => {
  it("lista cada registro con el servicio, el prestador, la fecha y las notas, y dice que es privado", async () => {
    simularApi();
    renderizar();

    const lista = await within(await seccion()).findByRole("list", { name: "Servicios contratados" });
    const [registro] = within(lista).getAllByRole("listitem");
    expect(registro).toHaveTextContent("10 de noviembre de 2026");
    expect(within(registro!).getByRole("link", { name: "Mantención de jardines" })).toHaveAttribute("href", "/servicios/s1");
    expect(registro).toHaveTextContent("Ofrecido por Pedro Soto");
    expect(registro).toHaveTextContent("Cobró $35.000 por todo el jardín.");
    expect(screen.getByText(/solo tú lo ves: los prestadores no saben que los registraste/i)).toBeInTheDocument();
  });

  it("enlaza a valorar si todavía no lo valoró, o a su valoración si ya lo hizo", async () => {
    simularApi({ contrataciones: [contratacion(), contratacion({ id: "k2", valoracion: { id: "v1" } })] });
    renderizar();

    const lista = await within(await seccion()).findByRole("list", { name: "Servicios contratados" });
    const [sinValorar, valorado] = within(lista).getAllByRole("listitem");
    expect(within(sinValorar!).getByRole("link", { name: "Valorar a Pedro Soto" })).toHaveAttribute("href", "/servicios/s1#valoraciones");
    expect(within(valorado!).getByRole("link", { name: "Ver tu valoración" })).toHaveAttribute("href", "/servicios/s1#valoraciones");
  });

  it("si la publicación ya no existe, muestra el título guardado y lo avisa, sin enlaces a una página que no está", async () => {
    simularApi({ contrataciones: [contratacion({ servicio: { id: null, titulo: "Poda de árboles altos", disponible: false } })] });
    renderizar();

    const registro = await within(await seccion()).findByRole("listitem");
    expect(within(registro).getByRole("heading", { name: "Poda de árboles altos" })).toBeInTheDocument();
    expect(registro).toHaveTextContent(/esta publicación ya no está disponible/i);
    expect(within(registro).queryByRole("link")).not.toBeInTheDocument();
  });

  it("sin registros: un estado vacío que explica para qué sirve", async () => {
    simularApi({ contrataciones: [] });
    renderizar();

    const vacia = await seccion();
    expect(await within(vacia).findByText(/aún no registras servicios contratados/i)).toBeInTheDocument();
    expect(within(vacia).getByText(/te sirve para recordar a quién llamaste, cuándo y qué te cobró/i)).toBeInTheDocument();
    expect(within(vacia).getByRole("link", { name: /buscar servicios/i })).toHaveAttribute("href", "/buscar");
  });

  it("edita la fecha y las notas: envía solo esos dos campos", async () => {
    simularApi();
    renderizar();

    const registro = await within(await seccion()).findByRole("listitem");
    fireEvent.click(within(registro).getByRole("button", { name: /editar/i }));
    fireEvent.change(within(registro).getByLabelText(/fecha en que lo contrataste/i), { target: { value: "2026-11-01" } });
    fireEvent.change(within(registro).getByLabelText(/notas/i), { target: { value: "  Volver en marzo.  " } });
    fireEvent.click(within(registro).getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByText("Guardamos los cambios.")).toBeInTheDocument();
    const [llamada] = llamadas("PATCH", /\/api\/contrataciones\/k1$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ fechaContratacion: "2026-11-01", notas: "Volver en marzo." });
    expect(await within(await seccion()).findByText("1 de noviembre de 2026")).toBeInTheDocument();
  });

  it("no deja guardar una fecha futura ni notas de más de 500 caracteres", async () => {
    simularApi();
    renderizar();

    const registro = await within(await seccion()).findByRole("listitem");
    fireEvent.click(within(registro).getByRole("button", { name: /editar/i }));
    fireEvent.change(within(registro).getByLabelText(/fecha en que lo contrataste/i), { target: { value: "2999-01-01" } });
    fireEvent.change(within(registro).getByLabelText(/notas/i), { target: { value: "a".repeat(501) } });
    fireEvent.click(within(registro).getByRole("button", { name: /guardar cambios/i }));

    expect(await within(registro).findByText("La fecha no puede ser futura.")).toBeInTheDocument();
    expect(within(registro).getByText(/no pueden superar los 500 caracteres/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /\/api\/contrataciones\//)).toHaveLength(0);
  });

  it("elimina un registro después de confirmar", async () => {
    simularApi();
    renderizar();

    const registro = await within(await seccion()).findByRole("listitem");
    fireEvent.click(within(registro).getByRole("button", { name: /eliminar/i }));
    expect(llamadas("DELETE", /\/api\/contrataciones\//)).toHaveLength(0);
    fireEvent.click(within(registro).getByRole("button", { name: /sí, eliminar/i }));

    expect(await screen.findByText("Eliminamos el registro.")).toBeInTheDocument();
    expect(llamadas("DELETE", /\/api\/contrataciones\/k1$/)).toHaveLength(1);
    expect(await within(await seccion()).findByText(/aún no registras servicios contratados/i)).toBeInTheDocument();
  });

  it("con más registros que los de la primera página, ofrece «Ver más»", async () => {
    simularApi({ total: 12 });
    renderizar();

    expect(await within(await seccion()).findByRole("button", { name: "Ver más" })).toBeInTheDocument();
  });

  it("una cuenta de administración no tiene esta sección ni la consulta", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "ADMINISTRADOR" } });
    renderizar();

    await screen.findByText("ADMINISTRADOR");
    // Sincroniza con la carga de la sección de la foto, que va justo antes.
    await waitFor(() => expect(llamadas("GET", /\/api\/cuenta\/foto$/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("region", { name: "Servicios contratados" })).not.toBeInTheDocument();
    expect(llamadas("GET", /\/api\/contrataciones/)).toHaveLength(0);
  });
});
