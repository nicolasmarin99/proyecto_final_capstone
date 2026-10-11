import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi } from "./api/cliente";
import App from "./App";
import { ProveedorAuth } from "./auth/ContextoAuth";

const CLIENTE = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true };
const PRESTADOR = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const ADMIN = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Marta Rojas", rol: "ADMINISTRADOR", correoVerificado: true };

type UsuarioDePrueba = typeof CLIENTE;

const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };
const PERFIL = {
  id: "perfil-1",
  descripcion: "Gasfíter con 10 años de experiencia en calefont.",
  telefono: "+56912345678",
  radioAtencionKm: 15,
  comuna: SANTIAGO,
  comunasAtencion: [SANTIAGO],
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  /** Quién tiene la sesión abierta al cargar; null es «sin sesión». */
  usuario?: UsuarioDePrueba | null;
  /** Quién entra al iniciar sesión, si la prueba lo hace. */
  alEntrar?: UsuarioDePrueba;
  perfil?: typeof PERFIL | null;
}

/** Simula la API. Recuerda si hay sesión, como la cookie de refresco. */
function simularApi({ usuario = null, alEntrar = PRESTADOR, perfil = null }: Escenario = {}) {
  let conectado = usuario;

  vi.mocked(fetch).mockImplementation(async (entrada) => {
    const url = String(entrada);

    if (url === "/api/auth/refrescar") {
      return conectado ? json({ accessToken: "t", usuario: conectado }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/login") {
      conectado = alEntrar;
      return json({ accessToken: "t", usuario: alEntrar });
    }
    if (url === "/api/auth/yo") return json({ usuario: conectado });
    if (url === "/api/comunas") return json({ comunas: [SANTIAGO] });
    if (url === "/api/categorias") return json({ categorias: [{ slug: "gasfiteria", nombre: "Gasfitería" }] });
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/prestadores/yo") {
      return perfil
        ? json({ perfil })
        : json({ error: { codigo: "PERFIL_NO_ENCONTRADO", mensaje: "Aún no has creado tu perfil." } }, 404);
    }
    if (url === "/api/servicios/mios") {
      return perfil
        ? json({ servicios: [], requisitosPendientes: [{ codigo: "IDENTIDAD_NO_VERIFICADA", mensaje: "Verifica tu identidad." }] })
        : json({ error: { codigo: "PERFIL_REQUERIDO", mensaje: "Primero completa tu perfil." } }, 409);
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
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

/** El botón del menú de usuario, que lleva el nombre y el rol. */
function botonMenu(nombre: string) {
  return within(screen.getByRole("banner")).findByRole("button", { name: new RegExp(nombre, "i") });
}

async function iniciarSesion() {
  await screen.findByRole("button", { name: "Entrar" });
  fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: PRESTADOR.correo } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: "contrasena-segura-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Encabezado", () => {
  it("sin sesión ofrece iniciar sesión y registrarse", async () => {
    simularApi();
    renderizar("/estado");

    const encabezado = screen.getByRole("banner");
    expect(await within(encabezado).findByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/iniciar-sesion");
    expect(within(encabezado).getByRole("link", { name: "Registrarse" })).toHaveAttribute("href", "/registro");
    expect(within(encabezado).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    [CLIENTE, "Cliente"],
    [PRESTADOR, "Prestador"],
    [ADMIN, "Administrador"],
  ])("con sesión muestra el nombre y el rol de $nombre", async (usuario, rol) => {
    simularApi({ usuario });
    renderizar("/estado");

    const boton = await botonMenu(usuario.nombre);
    expect(boton).toHaveTextContent(usuario.nombre);
    expect(boton).toHaveTextContent(rol);
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("las opciones del menú dependen del rol", async () => {
    simularApi({ usuario: ADMIN });
    renderizar("/estado");

    fireEvent.click(await botonMenu(ADMIN.nombre));

    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/perfil");
    expect(screen.getByRole("link", { name: "Panel de administración" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mis servicios" })).not.toBeInTheDocument();
  });

  it("el menú se cierra con Escape y devuelve el foco al botón", async () => {
    simularApi({ usuario: CLIENTE });
    renderizar("/estado");

    const boton = await botonMenu(CLIENTE.nombre);
    expect(boton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    screen.getByRole("link", { name: "Mi cuenta" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Mi cuenta" })).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it("el menú se cierra con un clic fuera", async () => {
    simularApi({ usuario: CLIENTE });
    renderizar("/estado");

    const boton = await botonMenu(CLIENTE.nombre);
    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);

    expect(boton).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Prestador sin perfil completo", () => {
  it("el menú ofrece «Completar perfil» y no sus servicios", async () => {
    simularApi({ usuario: PRESTADOR, perfil: null });
    renderizar("/estado");

    fireEvent.click(await botonMenu(PRESTADOR.nombre));

    expect(await screen.findByRole("link", { name: "Completar perfil" })).toHaveAttribute("href", "/mi/perfil");
    expect(screen.queryByRole("link", { name: "Mis servicios" })).not.toBeInTheDocument();
  });

  it("en sus servicios ve el llamado a completar el perfil, no el botón de publicar", async () => {
    simularApi({ usuario: PRESTADOR, perfil: null });
    renderizar("/mi/servicios");

    await screen.findByRole("heading", { level: 1, name: "Mis servicios" });
    const contenido = screen.getByRole("main");
    expect(await within(contenido).findByRole("link", { name: "Completar perfil" })).toHaveAttribute("href", "/mi/perfil");
    expect(within(contenido).queryByRole("link", { name: /publicar/i })).not.toBeInTheDocument();
  });
});

describe("Prestador con perfil completo", () => {
  it("ve «Publicar servicio», que lleva a su propia página", async () => {
    simularApi({ usuario: PRESTADOR, perfil: PERFIL });
    renderizar("/mi/servicios");

    await screen.findByRole("heading", { level: 1, name: "Mis servicios" });
    const enlace = await within(screen.getByRole("main")).findByRole("link", { name: "Publicar servicio" });
    expect(enlace).toHaveAttribute("href", "/mi/servicios/nuevo");

    fireEvent.click(enlace);
    expect(await screen.findByRole("heading", { level: 1, name: "Publicar servicio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar servicio/i })).toBeInTheDocument();
  });

  it("sin servicios, muestra el estado vacío que invita a publicar el primero", async () => {
    simularApi({ usuario: PRESTADOR, perfil: PERFIL });
    renderizar("/mi/servicios");

    expect(await screen.findByRole("heading", { name: /todavía no publicas ningún servicio/i })).toBeInTheDocument();
    expect(screen.getByText(/es lo que aparece cuando un cliente busca/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publicar mi primer servicio" })).toHaveAttribute("href", "/mi/servicios/nuevo");
  });

  it("la navegación del área muestra el estado de cada sección", async () => {
    simularApi({ usuario: PRESTADOR, perfil: PERFIL });
    renderizar("/mi/perfil");

    // Escritorio y móvil comparten la misma lista; en jsdom el lateral está en el DOM.
    const [navegacion] = await screen.findAllByRole("navigation", { name: "Área del prestador" });
    if (!navegacion) throw new Error("Falta la navegación del área");
    await waitFor(() => expect(within(navegacion).getByRole("link", { name: /mi perfil/i })).toHaveTextContent("Completo"));
    expect(within(navegacion).getByRole("link", { name: /mis servicios/i })).toHaveTextContent("Pendiente");
    expect(within(navegacion).getByRole("link", { name: /verificación de identidad/i })).toHaveTextContent("Pendiente");
  });
});

describe("Rutas del área del prestador", () => {
  it("a un cliente que entra a /mi/servicios lo rechaza", async () => {
    simularApi({ usuario: CLIENTE });
    renderizar("/mi/servicios");

    expect(await screen.findByText(/solo para prestadores/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mis servicios" })).not.toBeInTheDocument();
  });

  it("/perfil-prestador redirige a /mi/perfil", async () => {
    simularApi({ usuario: PRESTADOR, perfil: PERFIL });
    renderizar("/perfil-prestador");

    expect(await screen.findByRole("heading", { level: 1, name: "Tu perfil de prestador" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /mi perfil/i }).some((enlace) => enlace.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("en móvil, la navegación del área se abre como diálogo y Escape devuelve el foco", async () => {
    simularApi({ usuario: PRESTADOR, perfil: PERFIL });
    renderizar("/mi/perfil");

    const boton = await screen.findByRole("button", { name: /área del prestador/i });
    fireEvent.click(boton);

    const dialogo = screen.getByRole("dialog", { name: "Área del prestador" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    // El foco entra al diálogo.
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);

    // Tab desde el último elemento vuelve al primero: el foco no sale.
    const enfocables = within(dialogo).getAllByRole("link");
    enfocables[enfocables.length - 1]!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Cerrar" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});

describe("Después de iniciar sesión", () => {
  it("con un destino guardado, vuelve a él", async () => {
    simularApi({ usuario: null, alEntrar: PRESTADOR, perfil: PERFIL });
    renderizar("/mi/servicios");

    // La ruta protegida manda a iniciar sesión recordando /mi/servicios.
    await iniciarSesion();

    expect(await screen.findByRole("heading", { level: 1, name: "Mis servicios" })).toBeInTheDocument();
  });

  it("sin destino guardado, va a la portada", async () => {
    simularApi({ usuario: null, alEntrar: PRESTADOR, perfil: PERFIL });
    renderizar("/iniciar-sesion");

    await iniciarSesion();

    expect(await screen.findByRole("heading", { name: "Resuelve en tres pasos" })).toBeInTheDocument();
    expect(await botonMenu(PRESTADOR.nombre)).toHaveTextContent("Prestador");
  });
});
