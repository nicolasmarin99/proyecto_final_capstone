import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { MenuUsuario } from "../componentes/MenuUsuario";
import { FotosReportadas } from "../componentes/FotosReportadas";
import { RutaProtegida } from "../componentes/RutaProtegida";
import { ValoracionesPublicas } from "../componentes/Valoraciones";
import { useAuth } from "../auth/ContextoAuth";
import PaginaPerfil from "./Perfil";

/*
  Foto de perfil: cualquier cuenta sube la suya desde «Mi perfil», se ve en
  el encabezado y junto a sus valoraciones, se puede reportar, y el panel
  muestra solo las reportadas.
*/

const CLIENTE = { id: "u1", correo: "ana@ejemplo.cl", nombre: "Ana Rojas", rol: "CLIENTE", correoVerificado: true, rut: null, rutVerificado: false };
const FOTO = { id: "f1", url: "https://imagenes.prueba/completa/abc", miniatura: "https://imagenes.prueba/miniatura/abc" };
const FOTO_AJENA = { id: "f9", url: "https://imagenes.prueba/completa/xyz", miniatura: "https://imagenes.prueba/miniatura/xyz" };

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: object | null;
  mia?: object;
  subida?: Response;
  reportadas?: object[];
}

function simularApi({ usuario = CLIENTE, mia = { foto: null, retirada: null }, subida, reportadas = [] }: Escenario = {}) {
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";
    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "token-sesion", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/cuenta/foto" && metodo === "GET") return json(mia);
    if (url === "/api/cuenta/foto" && metodo === "PUT") return subida ?? json({ foto: FOTO }, 201);
    if (url === "/api/cuenta/foto" && metodo === "DELETE") return json(null, 204);
    if (/\/api\/fotos-perfil\/[^/]+\/reportes$/.test(url)) return json({ mensaje: "Gracias. Revisaremos esta foto." }, 202);
    if (url.startsWith("/api/servicios/s1/valoraciones?")) {
      return json({
        resumen: { cantidad: 2, promedio: null, distribucion: null },
        valoraciones: [
          { id: "v1", calificacion: 5, comentario: "Impecable.", creadaEn: "2026-11-01T12:00:00Z", editada: false, servicio: { id: "s1", titulo: "Gasfitería" }, cliente: { nombre: "Camila", foto: FOTO_AJENA } },
          { id: "v2", calificacion: 4, comentario: null, creadaEn: "2026-10-20T12:00:00Z", editada: false, servicio: { id: "s1", titulo: "Gasfitería" }, cliente: { nombre: "Matías", foto: null } },
        ],
        pagina: 1,
        porPagina: 10,
        total: 2,
      });
    }
    if (url.startsWith("/api/admin/fotos-perfil?")) return json({ fotos: reportadas, pagina: 1, porPagina: 20, total: reportadas.length });
    if (/\/api\/admin\/fotos-perfil\/[^/]+\/(retirar|desestimar)$/.test(url)) return json({ foto: { id: "f9", estado: "RETIRADA" } });
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(patron: RegExp, metodo?: string) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => patron.test(String(url)) && (!metodo || (opciones?.method ?? "GET") === metodo));
}

/** El menú del encabezado, para ver que la foto nueva aparece sin recargar. */
function Encabezado() {
  const { usuario } = useAuth();
  return usuario ? <MenuUsuario usuario={{ ...CLIENTE, ...usuario }} /> : null;
}

function renderizar(contenido: ReactNode, ruta = "/") {
  const cliente = crearClienteApi();
  return {
    cliente,
    ...render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorAuth cliente={cliente}>
          <Encabezado />
          {contenido}
        </ProveedorAuth>
      </MemoryRouter>,
    ),
  };
}

function renderizarPerfil() {
  const cliente = crearClienteApi();
  return render(
    <MemoryRouter initialEntries={["/perfil"]}>
      <ProveedorAuth cliente={cliente}>
        <Encabezado />
        <Routes>
          <Route path="/perfil" element={<RutaProtegida><PaginaPerfil cliente={cliente} /></RutaProtegida>} />
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

function archivo(nombre: string, tipo: string, bytes = 1024) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe("Mi perfil: la foto propia", () => {
  it("sube una foto: va como archivo a /cuenta/foto y aparece en el perfil y en el encabezado", async () => {
    simularApi();
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });
    expect(within(seccion).getByText(/Aún no tienes foto/)).toBeInTheDocument();

    fireEvent.change(within(seccion).getByLabelText("Subir foto"), { target: { files: [archivo("yo.jpg", "image/jpeg")] } });

    expect(await within(seccion).findByText("Listo: tu foto ya se ve en tu perfil.")).toBeInTheDocument();
    const [llamada] = llamadas(/\/api\/cuenta\/foto$/, "PUT");
    expect(llamada?.[1]?.body).toBeInstanceOf(FormData);
    expect((llamada?.[1]?.body as FormData).get("imagen")).toBeInstanceOf(File);
    expect(within(seccion).getByLabelText("Cambiar foto")).toBeInTheDocument();
    // El perfil (grande) usa la completa; el encabezado, la miniatura.
    const imagenes = document.querySelectorAll("img");
    expect([...imagenes].map((imagen) => imagen.getAttribute("src"))).toEqual(expect.arrayContaining([FOTO.url, FOTO.miniatura]));
  });

  it("un PDF o una foto de más de 5 MB se avisan sin llamar a la API", async () => {
    simularApi();
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });

    fireEvent.change(within(seccion).getByLabelText("Subir foto"), { target: { files: [archivo("cedula.pdf", "application/pdf")] } });
    expect(await within(seccion).findByRole("alert")).toHaveTextContent("JPG, PNG o WEBP");
    fireEvent.change(within(seccion).getByLabelText("Subir foto"), { target: { files: [archivo("enorme.jpg", "image/jpeg", 6 * 1024 * 1024)] } });
    expect(await within(seccion).findByRole("alert")).toHaveTextContent("supera los 5 MB");

    expect(llamadas(/\/api\/cuenta\/foto$/, "PUT")).toHaveLength(0);
  });

  it("muestra el error de la API bajo la foto (p. ej. el límite diario)", async () => {
    simularApi({ subida: json({ error: { codigo: "DEMASIADAS_FOTOS", mensaje: "Puedes cambiar tu foto hasta 10 veces en 24 horas. Inténtalo más tarde." } }, 429) });
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });

    fireEvent.change(within(seccion).getByLabelText("Subir foto"), { target: { files: [archivo("yo.jpg", "image/jpeg")] } });

    expect(await within(seccion).findByRole("alert")).toHaveTextContent("hasta 10 veces en 24 horas");
  });

  it("quitar la foto llama a DELETE y vuelve a la inicial", async () => {
    simularApi({ mia: { foto: FOTO, retirada: null } });
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });

    fireEvent.click(await within(seccion).findByRole("button", { name: "Quitar foto" }));

    expect(await within(seccion).findByText("Quitaste tu foto.")).toBeInTheDocument();
    expect(llamadas(/\/api\/cuenta\/foto$/, "DELETE")).toHaveLength(1);
    expect(within(seccion).getByLabelText("Subir foto")).toBeInTheDocument();
    expect(document.querySelector(`img[src="${FOTO.url}"]`)).toBeNull();
  });

  it("si un administrador la retiró, explica el motivo y deja subir otra", async () => {
    simularApi({ mia: { foto: null, retirada: { motivo: "La foto mostraba un documento de identidad.", retiradaEn: "2026-11-15T12:00:00Z" } } });
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });

    expect(await within(seccion).findByText(/Retiramos tu foto anterior/)).toBeInTheDocument();
    expect(within(seccion).getByText("Motivo: La foto mostraba un documento de identidad.")).toBeInTheDocument();
    expect(within(seccion).getByLabelText("Subir foto")).toBeInTheDocument();
  });

  it("con el correo sin confirmar no ofrece subir", async () => {
    simularApi({ usuario: { ...CLIENTE, correoVerificado: false } });
    renderizarPerfil();
    const seccion = await screen.findByRole("region", { name: "Tu foto de perfil" });

    expect(await within(seccion).findByText("Confirma tu correo para poder subir una foto.")).toBeInTheDocument();
    expect(within(seccion).queryByLabelText("Subir foto")).not.toBeInTheDocument();
  });

  it.each(["PRESTADOR", "ADMINISTRADOR"])("también la ofrece a una cuenta %s", async (rol) => {
    simularApi({ usuario: { ...CLIENTE, rol } });
    renderizarPerfil();

    expect(await screen.findByRole("region", { name: "Tu foto de perfil" })).toBeInTheDocument();
  });
});

describe("La foto del cliente en sus valoraciones", () => {
  it("se ve junto a su nombre; sin foto, la inicial y nada que reportar", async () => {
    simularApi({ usuario: null });
    renderizar(<ValoracionesPublicas fuente="servicio" id="s1" cliente={crearClienteApi()} />);

    const lista = await screen.findByRole("list", { name: "Lista de valoraciones" });
    const [conFoto, sinFoto] = within(lista).getAllByRole("listitem");
    expect(conFoto?.querySelector("img")?.getAttribute("src")).toBe(FOTO_AJENA.miniatura);
    expect(within(conFoto as HTMLElement).getByRole("button", { name: "Reportar la foto de Camila" })).toBeInTheDocument();
    expect(sinFoto?.querySelector("img")).toBeNull();
    expect(within(sinFoto as HTMLElement).queryByRole("button", { name: /Reportar la foto/ })).not.toBeInTheDocument();
  });

  it("reportarla envía el motivo elegido y agradece", async () => {
    simularApi();
    renderizar(<ValoracionesPublicas fuente="servicio" id="s1" cliente={crearClienteApi()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reportar la foto de Camila" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reportar la foto de Camila" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Suplantación de identidad/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar reporte" }));

    expect(await within(dialogo).findByText("Gracias. Revisaremos esta foto.")).toBeInTheDocument();
    const [llamada] = llamadas(/\/api\/fotos-perfil\/f9\/reportes$/, "POST");
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ motivo: "SUPLANTACION_DE_IDENTIDAD", comentario: null });
  });

  it("con «Otro» exige un comentario antes de enviar", async () => {
    simularApi();
    renderizar(<ValoracionesPublicas fuente="servicio" id="s1" cliente={crearClienteApi()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reportar la foto de Camila" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Otro/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar reporte" }));

    expect(await within(dialogo).findByText(/cuéntanos qué pasa en al menos 10 caracteres/)).toBeInTheDocument();
    expect(llamadas(/\/api\/fotos-perfil\//)).toHaveLength(0);
  });

  it("sin sesión invita a iniciarla en vez de mostrar el formulario", async () => {
    simularApi({ usuario: null });
    renderizar(<ValoracionesPublicas fuente="servicio" id="s1" cliente={crearClienteApi()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reportar la foto de Camila" }));
    const dialogo = await screen.findByRole("dialog");

    expect(within(dialogo).getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Enviar reporte" })).not.toBeInTheDocument();
  });

  it("la propia foto no se ofrece reportar", async () => {
    simularApi({ mia: { foto: FOTO_AJENA, retirada: null } });
    renderizar(<ValoracionesPublicas fuente="servicio" id="s1" cliente={crearClienteApi()} />);

    await screen.findByRole("list", { name: "Lista de valoraciones" });
    await waitFor(() => expect(llamadas(/\/api\/cuenta\/foto$/)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reportar la foto de Camila" })).not.toBeInTheDocument());
  });
});

const REPORTADA = {
  ...FOTO_AJENA,
  subidaEn: "2026-11-10T12:00:00Z",
  cuenta: { nombre: "Rodrigo Pérez", rol: "PRESTADOR" },
  retiradasAntes: 1,
  personas: 2,
  reportes: [
    { id: "d1", motivo: "IMAGENES_INAPROPIADAS", comentario: null, enviadoEn: "2026-11-11T12:00:00Z", cuentaConMasDeUnaSemana: true },
    { id: "d2", motivo: "OTRO", comentario: "Tiene un número de teléfono.", enviadoEn: "2026-11-12T12:00:00Z", cuentaConMasDeUnaSemana: false },
  ],
};

describe("Panel: fotos de perfil reportadas", () => {
  it("sin reportes lo dice y no muestra ninguna foto", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "ADMINISTRADOR" } });
    renderizar(<FotosReportadas cliente={crearClienteApi()} />);

    expect(await screen.findByText("No hay fotos de perfil reportadas.")).toBeInTheDocument();
  });

  it("muestra la foto, de quién es, los reportes y si ya se le retiró otra", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "ADMINISTRADOR" }, reportadas: [REPORTADA] });
    renderizar(<FotosReportadas cliente={crearClienteApi()} />);

    const seccion = await screen.findByRole("region", { name: "Fotos de perfil reportadas (1)" });
    expect(await within(seccion).findByRole("heading", { name: /Rodrigo Pérez · Prestador/ })).toBeInTheDocument();
    expect(within(seccion).getByText("2 personas la reportaron", { exact: false })).toBeInTheDocument();
    expect(within(seccion).getByText("Ya se le retiró 1 foto antes")).toBeInTheDocument();
    expect(within(seccion).getByText("Imagen inapropiada")).toBeInTheDocument();
    expect(within(seccion).getByText("Tiene un número de teléfono.")).toBeInTheDocument();
    expect(within(seccion).getByText(/cuenta con menos de una semana/)).toBeInTheDocument();
  });

  it("retirar exige un motivo y, con él, llama a la API y la saca de la lista", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "ADMINISTRADOR" }, reportadas: [REPORTADA] });
    renderizar(<FotosReportadas cliente={crearClienteApi()} />);
    const seccion = await screen.findByRole("region", { name: /Fotos de perfil reportadas/ });

    fireEvent.click(await within(seccion).findByRole("button", { name: "Retirar foto" }));
    fireEvent.click(within(seccion).getAllByRole("button", { name: "Retirar foto" })[0] as HTMLElement);
    expect(await within(seccion).findByText(/al menos 10 caracteres/)).toBeInTheDocument();
    expect(llamadas(/\/retirar$/)).toHaveLength(0);

    fireEvent.change(within(seccion).getByLabelText("Motivo (lo verá la persona)"), { target: { value: "La foto muestra un teléfono de contacto." } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Retirar foto" }));

    expect(await within(seccion).findByText("Se retiró la foto de Rodrigo Pérez.")).toBeInTheDocument();
    const [llamada] = llamadas(/\/api\/admin\/fotos-perfil\/f9\/retirar$/, "PATCH");
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ motivo: "La foto muestra un teléfono de contacto." });
    expect(within(seccion).queryByRole("heading", { name: /Rodrigo Pérez/ })).not.toBeInTheDocument();
  });

  it("desestimar llama a su propia ruta", async () => {
    simularApi({ usuario: { ...CLIENTE, rol: "ADMINISTRADOR" }, reportadas: [REPORTADA] });
    renderizar(<FotosReportadas cliente={crearClienteApi()} />);
    const seccion = await screen.findByRole("region", { name: /Fotos de perfil reportadas/ });

    fireEvent.click(await within(seccion).findByRole("button", { name: "Desestimar reportes" }));
    fireEvent.change(within(seccion).getByLabelText("Motivo de la decisión"), { target: { value: "Es una foto normal de la persona." } });
    fireEvent.click(within(seccion).getByRole("button", { name: "Desestimar reportes" }));

    expect(await within(seccion).findByText(/quedaron desestimados/)).toBeInTheDocument();
    expect(llamadas(/\/api\/admin\/fotos-perfil\/f9\/desestimar$/, "PATCH")).toHaveLength(1);
  });
});
