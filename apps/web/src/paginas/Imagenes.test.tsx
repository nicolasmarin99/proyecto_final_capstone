import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import App from "../App";
import { ProveedorAuth } from "../auth/ContextoAuth";

const PRESTADOR = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const ADMIN = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Marta Rojas", rol: "ADMINISTRADOR", correoVerificado: true };
const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };

function imagen(id: string, orden: number, extra: object = {}) {
  return {
    id,
    url: `https://img.prueba/completa/${id}`,
    miniatura: `https://img.prueba/miniatura/${id}`,
    orden,
    estado: "VISIBLE",
    motivoOcultamiento: null,
    ...extra,
  };
}

const SERVICIO = {
  id: "s1",
  titulo: "Gasfitería a domicilio",
  descripcion: "Reparación de calefont, filtraciones y destapes en toda la comuna.",
  precioDesde: null,
  precioHasta: null,
  unidadPrecio: null,
  estado: "PUBLICADO",
  categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
  categoriaPersonalizada: null,
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof PRESTADOR | typeof ADMIN | null;
  imagenes?: ReturnType<typeof imagen>[];
  publicas?: { id: string; url: string; miniatura: string }[];
}

/** Simula la API. Recuerda las imágenes del servicio como lo haría la base. */
function simularApi({ usuario = PRESTADOR, imagenes = [], publicas = [] }: Escenario = {}) {
  let actuales = [...imagenes];
  let siguiente = 100;

  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/comunas") return json({ comunas: [SANTIAGO] });
    if (url === "/api/categorias") return json({ categorias: [{ slug: "gasfiteria", nombre: "Gasfitería" }] });
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: { estado: "VERIFICADA", motivoRechazo: null, enviadaEn: "2026-10-01T00:00:00Z", revisadaEn: null }, cargasDisponibles: 3 });
    if (url === "/api/prestadores/yo") {
      return json({ perfil: { id: "perfil-1", descripcion: "Gasfíter con experiencia.", telefono: "+56912345678", radioAtencionKm: 10, comuna: SANTIAGO, comunasAtencion: [SANTIAGO] } });
    }
    if (url === "/api/servicios/mios") return json({ servicios: [{ ...SERVICIO, imagenes: actuales }], requisitosPendientes: [] });
    if (url === "/api/servicios" && metodo === "POST") return json({ servicio: { ...SERVICIO, id: "s-nuevo", imagenes: [] }, requisitosPendientes: [] }, 201);
    if (url === "/api/servicios/s1/imagenes" && metodo === "POST") {
      siguiente += 1;
      const nueva = imagen(`i${siguiente}`, actuales.length);
      actuales = [...actuales, nueva];
      return json({ imagen: nueva }, 201);
    }
    if (url === "/api/servicios/s-nuevo/imagenes" && metodo === "POST") return json({ imagen: imagen("i-nuevo", 0) }, 201);
    if (url === "/api/servicios/s1/imagenes/orden" && metodo === "PUT") {
      const ids = (JSON.parse(String(opciones?.body)) as { imagenes: string[] }).imagenes;
      actuales = ids.map((id, orden) => ({ ...(actuales.find((otra) => otra.id === id) ?? imagen(id, orden)), orden }));
      return json({ imagenes: actuales });
    }
    const borrar = /^\/api\/servicios\/s1\/imagenes\/([^/]+)$/.exec(url);
    if (borrar && metodo === "DELETE") {
      actuales = actuales.filter((otra) => otra.id !== borrar[1]);
      return { ok: true, status: 204, json: async () => null } as Response;
    }
    if (url === "/api/servicios/s1") {
      return json({
        servicio: { ...SERVICIO, imagenes: publicas, prestador: { id: "perfil-1", nombre: "Pedro Soto", comunas: [], credenciales: [] } },
      });
    }
    if (url === "/api/admin/resumen") return json({ resumen: { totalUsuarios: 2, porRol: { CLIENTE: 0, PRESTADOR: 1, ADMINISTRADOR: 1 } } });
    if (url.startsWith("/api/admin/identidades")) return json({ identidades: [], pagina: 1, porPagina: 10, total: 0 });
    if (url.startsWith("/api/admin/imagenes?") || url === "/api/admin/imagenes") {
      return json({
        imagenes: actuales.map((actual) => ({
          ...actual,
          subidaEn: "2026-10-10T12:00:00Z",
          ocultadaEn: null,
          ocultadaPor: null,
          servicio: { id: "s1", titulo: SERVICIO.titulo, estado: "PUBLICADO", prestador: "Pedro Soto" },
        })),
        pagina: 1,
        porPagina: 20,
        total: actuales.length,
      });
    }
    const ocultar = /^\/api\/admin\/imagenes\/([^/]+)\/ocultar$/.exec(url);
    if (ocultar && metodo === "PATCH") {
      const motivo = (JSON.parse(String(opciones?.body)) as { motivo: string }).motivo;
      return json({ imagen: { ...imagen(String(ocultar[1]), 0), estado: "OCULTA", motivoOcultamiento: motivo } });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={crearClienteApi()}>
        <App />
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function archivo(nombre: string, tipo: string, bytes = 1024) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

/** La sección de fotos del formulario, cuando ya cargó. */
async function seccionFotos() {
  return screen.findByRole("region", { name: /fotos de trabajos anteriores/i });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fotos en el formulario de servicio (editar)", () => {
  it("advierte sobre la privacidad de los clientes, explica que se quita la ubicación e indica los límites", async () => {
    simularApi();
    renderizar("/mi/servicios/s1/editar");

    const seccion = await seccionFotos();
    expect(within(seccion).getByText(/no subas fotos donde se reconozca la dirección/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/quitamos los metadatos de la foto, como la ubicación gps/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/hasta 5 fotos jpg, png o webp de hasta 5 mb/i)).toBeInTheDocument();
    expect(within(seccion).getByText("0 de 5")).toBeInTheDocument();
  });

  it("sube una foto en el campo «imagen» y la muestra como portada", async () => {
    simularApi();
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    fireEvent.change(within(seccion).getByLabelText("Agregar fotos"), { target: { files: [archivo("trabajo.jpg", "image/jpeg")] } });

    expect(await within(seccion).findByRole("img", { name: "Foto 1 de 1" })).toHaveAttribute("src", "https://img.prueba/miniatura/i101");
    expect(within(seccion).getByText("Portada")).toBeInTheDocument();
    const [llamada] = llamadas("POST", /\/api\/servicios\/s1\/imagenes$/);
    const cuerpo = llamada?.[1]?.body;
    expect(cuerpo).toBeInstanceOf(FormData);
    expect((cuerpo as FormData).get("imagen")).toBeInstanceOf(File);
  });

  it("revisa el tipo y el tamaño antes de subir", async () => {
    simularApi();
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    fireEvent.change(within(seccion).getByLabelText("Agregar fotos"), {
      target: { files: [archivo("documento.pdf", "application/pdf"), archivo("enorme.jpg", "image/jpeg", 5 * 1024 * 1024 + 1)] },
    });

    const alerta = await within(seccion).findByRole("alert");
    expect(alerta).toHaveTextContent("«documento.pdf» no es una imagen JPG, PNG o WEBP.");
    expect(alerta).toHaveTextContent("«enorme.jpg» supera los 5 MB.");
    expect(llamadas("POST", /imagenes$/)).toHaveLength(0);
  });

  it("con 5 fotos no deja agregar más", async () => {
    simularApi({ imagenes: [0, 1, 2, 3, 4].map((orden) => imagen(`i${orden}`, orden)) });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    await within(seccion).findByText("5 de 5");
    expect(within(seccion).getByLabelText(/llegaste al máximo/i)).toBeDisabled();
  });

  it("reordena con botones y avisa la posición nueva", async () => {
    simularApi({ imagenes: [imagen("a", 0), imagen("b", 1), imagen("c", 2)] });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    fireEvent.click(await within(seccion).findByRole("button", { name: "Mover la foto 3 antes" }));

    await waitFor(() => expect(llamadas("PUT", /\/imagenes\/orden$/)).toHaveLength(1));
    expect(JSON.parse(String(llamadas("PUT", /\/imagenes\/orden$/)[0]?.[1]?.body))).toEqual({ imagenes: ["a", "c", "b"] });
    expect(await within(seccion).findByText("Foto movida a la posición 2 de 3.")).toBeInTheDocument();
    expect(within(seccion).getByRole("button", { name: "Mover la foto 1 antes" })).toBeDisabled();
  });

  it("reordena arrastrando", async () => {
    simularApi({ imagenes: [imagen("a", 0), imagen("b", 1), imagen("c", 2)] });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();
    const fotos = within(await within(seccion).findByRole("list", { name: /fotos del servicio/i })).getAllByRole("listitem");

    fireEvent.dragStart(fotos[0] as HTMLElement);
    fireEvent.dragOver(fotos[2] as HTMLElement);
    fireEvent.drop(fotos[2] as HTMLElement);

    await waitFor(() => expect(llamadas("PUT", /\/imagenes\/orden$/)).toHaveLength(1));
    expect(JSON.parse(String(llamadas("PUT", /\/imagenes\/orden$/)[0]?.[1]?.body))).toEqual({ imagenes: ["b", "c", "a"] });
  });

  it("elimina una foto", async () => {
    simularApi({ imagenes: [imagen("a", 0), imagen("b", 1)] });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    fireEvent.click(await within(seccion).findByRole("button", { name: "Eliminar la foto 1" }));

    await waitFor(() => expect(llamadas("DELETE", /\/api\/servicios\/s1\/imagenes\/a$/)).toHaveLength(1));
    expect(await within(seccion).findByText("1 de 5")).toBeInTheDocument();
  });

  it("una foto oculta por moderación muestra un marcador con el motivo, sin intentar cargarla", async () => {
    simularApi({
      imagenes: [imagen("visible", 0), imagen("oculta", 1, { estado: "OCULTA", motivoOcultamiento: "Se ve el número de la casa." })],
    });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();

    const ocultas = await within(seccion).findByRole("list", { name: "Fotos ocultas por moderación" });
    expect(within(ocultas).getByText("Foto oculta")).toBeInTheDocument();
    expect(within(ocultas).getByText(/se ve el número de la casa/i)).toBeInTheDocument();
    // Su archivo ya no existe: ninguna <img> apunta a ella.
    expect(within(ocultas).queryByRole("img")).not.toBeInTheDocument();
    expect(seccion.querySelector("img[src*='oculta']")).toBeNull();
    // No se reordena, pero ocupa cupo hasta que se elimina.
    expect(within(ocultas).queryByRole("button", { name: /mover/i })).not.toBeInTheDocument();
    expect(within(seccion).getByText("2 de 5")).toBeInTheDocument();
    expect(within(seccion).getByText(/no se pueden volver a mostrar/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/hasta que las elimines/i)).toBeInTheDocument();
  });

  it("el prestador puede eliminar una foto oculta y libera su lugar", async () => {
    simularApi({
      imagenes: [imagen("visible", 0), imagen("oculta", 1, { estado: "OCULTA", motivoOcultamiento: "Se ve el número de la casa." })],
    });
    renderizar("/mi/servicios/s1/editar");
    const seccion = await seccionFotos();
    const ocultas = await within(seccion).findByRole("list", { name: "Fotos ocultas por moderación" });

    fireEvent.click(within(ocultas).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(llamadas("DELETE", /\/api\/servicios\/s1\/imagenes\/oculta$/)).toHaveLength(1));
    await waitFor(() => expect(within(seccion).queryByRole("list", { name: "Fotos ocultas por moderación" })).not.toBeInTheDocument());
    expect(within(seccion).getByText("1 de 5")).toBeInTheDocument();
  });
});

describe("Fotos en el formulario de servicio (crear)", () => {
  it("guarda las fotos elegidas y las sube después de crear el servicio", async () => {
    simularApi();
    renderizar("/mi/servicios/nuevo");
    const seccion = await seccionFotos();

    fireEvent.change(within(seccion).getByLabelText("Agregar fotos"), { target: { files: [archivo("trabajo.png", "image/png")] } });
    expect(await within(seccion).findByText("1 de 5")).toBeInTheDocument();
    // Todavía no hay servicio: nada se sube.
    expect(llamadas("POST", /imagenes$/)).toHaveLength(0);

    const formulario = within(screen.getByRole("main"));
    await formulario.findByRole("option", { name: "Gasfitería" });
    fireEvent.change(formulario.getByLabelText("Categoría"), { target: { value: "gasfiteria" } });
    fireEvent.change(formulario.getByLabelText(/^título/i), { target: { value: "Gasfitería a domicilio" } });
    fireEvent.change(formulario.getByLabelText(/descripción del servicio/i), {
      target: { value: "Reparación de calefont, filtraciones y destapes en toda la comuna." },
    });
    fireEvent.click(formulario.getByRole("button", { name: /guardar servicio/i }));

    await waitFor(() => expect(llamadas("POST", /\/api\/servicios\/s-nuevo\/imagenes$/)).toHaveLength(1));
    expect(await screen.findByRole("heading", { level: 1, name: "Mis servicios" })).toBeInTheDocument();
  });
});

describe("Galería en la página pública", () => {
  const PUBLICAS = ["a", "b", "c"].map((id) => ({ id, url: `https://img.prueba/completa/${id}`, miniatura: `https://img.prueba/miniatura/${id}` }));

  it("destaca la primera con texto alternativo descriptivo y deja elegir otra", async () => {
    simularApi({ usuario: null, publicas: PUBLICAS });
    renderizar("/servicios/s1");

    const principal = await screen.findByRole("img", { name: "Trabajo de gasfitería de «Gasfitería a domicilio», foto 1 de 3" });
    expect(principal).toHaveAttribute("src", "https://img.prueba/completa/a");
    expect(screen.getByRole("button", { name: "Ver foto 1 de 3" })).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Ver foto 3 de 3" }));

    expect(screen.getByRole("img", { name: /foto 3 de 3/ })).toHaveAttribute("src", "https://img.prueba/completa/c");
    expect(screen.getByRole("button", { name: "Ver foto 3 de 3" })).toHaveAttribute("aria-current", "true");
  });

  it("se recorre con las flechas del teclado", async () => {
    simularApi({ usuario: null, publicas: PUBLICAS });
    renderizar("/servicios/s1");

    const lista = await screen.findByRole("list", { name: "Elegir foto" });
    screen.getByRole("button", { name: "Ver foto 1 de 3" }).focus();
    fireEvent.keyDown(lista, { key: "ArrowLeft" });

    expect(screen.getByRole("button", { name: "Ver foto 3 de 3" })).toHaveFocus();
    expect(screen.getByRole("img", { name: /foto 3 de 3/ })).toBeInTheDocument();
  });

  it("las flechas avanzan desde la miniatura con foco, aunque la elegida sea otra", async () => {
    simularApi({ usuario: null, publicas: PUBLICAS });
    renderizar("/servicios/s1");

    const lista = await screen.findByRole("list", { name: "Elegir foto" });
    fireEvent.click(screen.getByRole("button", { name: "Ver foto 3 de 3" }));
    const primera = screen.getByRole("button", { name: "Ver foto 1 de 3" });
    primera.focus();
    fireEvent.keyDown(primera, { key: "ArrowRight" });

    expect(screen.getByRole("button", { name: "Ver foto 2 de 3" })).toHaveFocus();
    expect(within(lista).getByRole("button", { name: "Ver foto 2 de 3" })).toHaveAttribute("aria-current", "true");
  });

  it("sin fotos, la página no muestra galería", async () => {
    simularApi({ usuario: null, publicas: [] });
    renderizar("/servicios/s1");

    await screen.findByRole("heading", { level: 1, name: "Gasfitería a domicilio" });
    expect(screen.queryByRole("region", { name: /fotos de trabajos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("Moderación en el panel de administración", () => {
  it("si el proveedor no pudo borrar el archivo, lo dice y la imagen sigue visible", async () => {
    simularApi({ usuario: ADMIN, imagenes: [imagen("a", 0)] });
    const original = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (entrada, opciones) =>
      /\/ocultar$/.test(String(entrada))
        ? json(
            {
              error: {
                codigo: "ALMACENAMIENTO_NO_DISPONIBLE",
                mensaje: "No se pudo borrar el archivo de la imagen, así que no se ocultó. Sigue visible; intenta de nuevo en un momento.",
              },
            },
            502,
          )
        : (original?.(entrada, opciones) ?? json({}, 500)),
    );
    renderizar("/admin");

    const grupo = await screen.findByRole("article", { name: "Imágenes de «Gasfitería a domicilio»" });
    fireEvent.click(within(grupo).getByRole("button", { name: "Ocultar" }));
    fireEvent.change(within(grupo).getByLabelText(/motivo/i), { target: { value: "Se ve la patente del auto del cliente." } });
    fireEvent.click(within(grupo).getByRole("button", { name: "Ocultar imagen" }));

    expect(await within(grupo).findByText(/no se ocultó\. sigue visible/i)).toBeInTheDocument();
    expect(within(grupo).getByText("Visible")).toBeInTheDocument();
    expect(within(grupo).getByRole("img")).toBeInTheDocument();
  });

  it("lista las imágenes por servicio y oculta una con motivo", async () => {
    simularApi({ usuario: ADMIN, imagenes: [imagen("a", 0)] });
    renderizar("/admin");

    const seccion = await screen.findByRole("region", { name: "Imágenes de servicios" });
    const grupo = await within(seccion).findByRole("article", { name: "Imágenes de «Gasfitería a domicilio»" });
    fireEvent.click(within(grupo).getByRole("button", { name: "Ocultar" }));

    // Antes de confirmar, avisa que no se puede deshacer.
    expect(within(grupo).getByText(/no se puede deshacer: el archivo se borra de internet/i)).toBeInTheDocument();

    // Sin motivo suficiente no se envía.
    fireEvent.change(within(grupo).getByLabelText(/motivo/i), { target: { value: "corto" } });
    fireEvent.click(within(grupo).getByRole("button", { name: "Ocultar imagen" }));
    expect(await within(grupo).findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /ocultar$/)).toHaveLength(0);

    fireEvent.change(within(grupo).getByLabelText(/motivo/i), { target: { value: "Se ve la patente del auto del cliente." } });
    fireEvent.click(within(grupo).getByRole("button", { name: "Ocultar imagen" }));

    expect(await within(grupo).findByText("Oculta")).toBeInTheDocument();
    expect(within(grupo).getByText(/se ve la patente/i)).toBeInTheDocument();
    // Ya no hay archivo: en lugar de la foto, un marcador; y no se ofrece volver a mostrarla.
    expect(within(grupo).getByText("Archivo eliminado")).toBeInTheDocument();
    expect(within(grupo).queryByRole("img")).not.toBeInTheDocument();
    expect(within(grupo).queryByRole("button")).not.toBeInTheDocument();
    expect(JSON.parse(String(llamadas("PATCH", /\/api\/admin\/imagenes\/a\/ocultar$/)[0]?.[1]?.body))).toEqual({
      motivo: "Se ve la patente del auto del cliente.",
    });
  });
});
