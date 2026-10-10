import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { RutaProtegida } from "../componentes/RutaProtegida";
import PaginaIniciarSesion from "./IniciarSesion";
import PaginaPerfil from "./Perfil";
import PaginaPerfilPrestador from "./PerfilPrestador";
import PaginaVerificarCorreo from "./VerificarCorreo";

const prestador = {
  id: "p1",
  correo: "pedro@ejemplo.cl",
  nombre: "Pedro Soto",
  rol: "PRESTADOR",
  correoVerificado: true,
};

const COMUNAS = [
  { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } },
  { id: 16101, nombre: "Chillán", region: { id: 16, nombre: "Ñuble", orden: 10 } },
  { id: 15101, nombre: "Arica", region: { id: 15, nombre: "Arica y Parinacota", orden: 1 } },
];

const PERFIL = {
  id: "perfil-1",
  descripcion: "Gasfíter con 10 años de experiencia en calefont.",
  telefono: "+56912345678",
  radioAtencionKm: 15,
  comuna: COMUNAS[0],
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: typeof prestador;
  /** Perfil que devuelve GET /prestadores/yo; null es "todavía no lo creó" (404). */
  perfil?: typeof PERFIL | null;
  /** Respuesta del PUT /prestadores/yo. */
  respuestaGuardar?: Response;
}

/** Simula la API respondiendo según método y ruta, como lo haría el servidor. */
function simularApi({ usuario = prestador, perfil = null, respuestaGuardar }: Escenario = {}) {
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar" || url === "/api/auth/login") return json({ accessToken: "t", usuario });
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/comunas") return json({ comunas: COMUNAS });
    if (url === "/api/auth/verificar-correo") return json({ mensaje: "Tu correo quedó confirmado." });
    if (url === "/api/prestadores/yo" && metodo === "PUT") {
      return respuestaGuardar ?? json({ perfil: PERFIL }, 201);
    }
    if (url === "/api/prestadores/yo") {
      return perfil
        ? json({ perfil })
        : json({ error: { codigo: "PERFIL_NO_ENCONTRADO", mensaje: "Aún no has creado tu perfil." } }, 404);
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

/** Cuerpo del PUT que llegó a la API, si llegó. */
function cuerpoEnviado(): unknown {
  const llamada = vi
    .mocked(fetch)
    .mock.calls.find(([url, opciones]) => String(url) === "/api/prestadores/yo" && opciones?.method === "PUT");
  return llamada ? JSON.parse(String(llamada[1]?.body)) : undefined;
}

function renderizar(ruta: string, cliente: ClienteApi = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/iniciar-sesion" element={<PaginaIniciarSesion cliente={cliente} />} />
          <Route
            path="/perfil"
            element={
              <RutaProtegida>
                <PaginaPerfil cliente={cliente} />
              </RutaProtegida>
            }
          />
          <Route path="/verificar-correo" element={<PaginaVerificarCorreo cliente={cliente} />} />
          <Route
            path="/perfil-prestador"
            element={
              <RutaProtegida roles={["PRESTADOR"]}>
                <PaginaPerfilPrestador cliente={cliente} />
              </RutaProtegida>
            }
          />
        </Routes>
      </ProveedorAuth>
    </MemoryRouter>,
  );
}

function escribir(etiqueta: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

/** Espera a que el formulario termine de cargar (el selector ya tiene comunas). */
async function esperarFormulario() {
  await screen.findByRole("option", { name: "Santiago" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Formulario de perfil de prestador", () => {
  it("puebla el selector de comunas desde la API, agrupado por región de norte a sur", async () => {
    simularApi();
    renderizar("/perfil-prestador");
    await esperarFormulario();

    const selector = screen.getByLabelText(/comuna/i);
    const grupos = within(selector).getAllByRole("group");
    expect(grupos.map((grupo) => grupo.getAttribute("label"))).toEqual([
      "Arica y Parinacota",
      "Metropolitana de Santiago",
      "Ñuble",
    ]);
    expect(within(grupos[2]!).getByRole("option", { name: "Chillán" })).toBeInTheDocument();
  });

  it("sin perfil explica por qué completarlo", async () => {
    simularApi({ perfil: null });
    renderizar("/perfil-prestador");
    await esperarFormulario();

    expect(screen.getByText(/aparecer en las búsquedas/i)).toBeInTheDocument();
  });

  it("con perfil carga sus datos en el formulario", async () => {
    simularApi({ perfil: PERFIL });
    renderizar("/perfil-prestador");
    await esperarFormulario();

    await waitFor(() => expect(screen.getByLabelText(/descripción/i)).toHaveValue(PERFIL.descripcion));
    expect(screen.getByLabelText(/comuna/i)).toHaveValue("13101");
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("+56 9 1234 5678");
  });

  it("envía el perfil con el teléfono normalizado y confirma", async () => {
    simularApi();
    renderizar("/perfil-prestador");
    await esperarFormulario();

    fireEvent.change(screen.getByLabelText(/comuna/i), { target: { value: "16101" } });
    escribir(/descripción/i, "Gasfíter con 10 años de experiencia en calefont.");
    escribir(/teléfono/i, "9 1234 5678");
    escribir(/radio/i, "25");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/perfil quedó guardado/i)).toBeInTheDocument();
    expect(cuerpoEnviado()).toEqual({
      descripcion: "Gasfíter con 10 años de experiencia en calefont.",
      telefono: "+56912345678",
      comunaId: 16101,
      radioAtencionKm: 25,
    });
  });

  it("muestra bajo cada campo los errores que devuelve la API", async () => {
    simularApi({
      respuestaGuardar: json(
        {
          error: {
            codigo: "DATOS_INVALIDOS",
            mensaje: "Los datos enviados no son válidos.",
            detalles: [{ campo: "comunaId", mensaje: "La comuna seleccionada no existe." }],
          },
        },
        400,
      ),
    });
    renderizar("/perfil-prestador");
    await esperarFormulario();

    fireEvent.change(screen.getByLabelText(/comuna/i), { target: { value: "13101" } });
    escribir(/descripción/i, "Gasfíter con 10 años de experiencia en calefont.");
    escribir(/teléfono/i, "9 1234 5678");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText("La comuna seleccionada no existe.")).toBeInTheDocument();
    expect(screen.getByLabelText(/comuna/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("valida en el navegador antes de enviar: descripción corta y teléfono fijo", async () => {
    simularApi();
    renderizar("/perfil-prestador");
    await esperarFormulario();

    fireEvent.change(screen.getByLabelText(/comuna/i), { target: { value: "13101" } });
    escribir(/descripción/i, "a".repeat(19));
    escribir(/teléfono/i, "2 2123 4567");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/al menos 20 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/celular chileno/i)).toBeInTheDocument();
    expect(cuerpoEnviado()).toBeUndefined();
  });

  it("cuenta los caracteres de la descripción mientras se escribe", async () => {
    simularApi();
    renderizar("/perfil-prestador");
    await esperarFormulario();

    escribir(/descripción/i, "Hola");

    expect(screen.getByText("4 / 1000")).toBeInTheDocument();
  });

  it("un cliente no ve el formulario", async () => {
    simularApi({ usuario: { ...prestador, rol: "CLIENTE" } });
    renderizar("/perfil-prestador");

    expect(await screen.findByText(/solo para prestadores/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/comuna/i)).not.toBeInTheDocument();
  });
});

describe("Llegada al perfil de prestador", () => {
  async function iniciarSesion() {
    // Sin sesión al arrancar: el refresco inicial falla.
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { codigo: "SESION_INVALIDA" } }, 401));
    renderizar("/iniciar-sesion");
    await screen.findByRole("button", { name: "Entrar" });
    escribir(/correo/i, prestador.correo);
    escribir(/contraseña/i, "contrasena-segura-123");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  }

  it("un prestador verificado sin perfil va directo a completarlo", async () => {
    simularApi({ perfil: null });
    await iniciarSesion();

    expect(await screen.findByRole("heading", { name: /completa tu perfil/i })).toBeInTheDocument();
  });

  it("un prestador con perfil va a su cuenta", async () => {
    simularApi({ perfil: PERFIL });
    await iniciarSesion();

    expect(await screen.findByRole("heading", { name: "Mi perfil" })).toBeInTheDocument();
  });
});

describe("Confirmación de correo", () => {
  it("a un prestador con la sesión abierta lo lleva a completar su perfil", async () => {
    simularApi();
    renderizar("/verificar-correo?token=abc");

    const enlace = await screen.findByRole("link", { name: /completar mi perfil de prestador/i });
    expect(enlace).toHaveAttribute("href", "/perfil-prestador");
  });

  it("sin sesión avisa que al entrar se pedirá el perfil", async () => {
    vi.mocked(fetch).mockImplementation(async (entrada) =>
      String(entrada) === "/api/auth/verificar-correo"
        ? json({ mensaje: "ok" })
        : json({ error: { codigo: "SESION_INVALIDA" } }, 401),
    );
    renderizar("/verificar-correo?token=abc");

    expect(await screen.findByText(/te pediremos completar tu perfil/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir a iniciar sesión/i })).toBeInTheDocument();
  });
});

describe("Estado del prestador en /perfil", () => {
  it("con perfil completo lo marca listo y deja pendientes identidad y servicio", async () => {
    simularApi({ perfil: PERFIL });
    renderizar("/perfil");

    const lista = await screen.findByRole("list", { name: /para aparecer en las búsquedas/i });
    const pasos = within(lista).getAllByRole("listitem");

    expect(pasos[0]).toHaveTextContent(/perfil completo/i);
    expect(pasos[0]).toHaveTextContent(/listo/i);
    expect(pasos[1]).toHaveTextContent(/identidad verificada/i);
    expect(pasos[1]).toHaveTextContent(/pendiente/i);
    expect(pasos[2]).toHaveTextContent(/al menos un servicio/i);
    expect(pasos[2]).toHaveTextContent(/pendiente/i);
    expect(screen.getByRole("link", { name: /editar mi perfil/i })).toHaveAttribute("href", "/perfil-prestador");
  });

  it("sin perfil lo marca pendiente y ofrece completarlo", async () => {
    simularApi({ perfil: null });
    renderizar("/perfil");

    const lista = await screen.findByRole("list", { name: /para aparecer en las búsquedas/i });
    expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent(/pendiente/i);
    expect(screen.getByRole("link", { name: /completar mi perfil/i })).toHaveAttribute(
      "href",
      "/perfil-prestador",
    );
  });

  it("a un cliente no le muestra nada de esto", async () => {
    simularApi({ usuario: { ...prestador, rol: "CLIENTE" } });
    renderizar("/perfil");

    await screen.findByText(prestador.correo);
    expect(screen.queryByRole("list", { name: /para aparecer en las búsquedas/i })).not.toBeInTheDocument();
  });
});
