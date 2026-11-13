import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, type ClienteApi, type ResultadoBusqueda } from "../api/cliente";
import { ProveedorAuth } from "../auth/ContextoAuth";
import { AreaPrestador } from "../componentes/AreaPrestador";
import { RutaProtegida } from "../componentes/RutaProtegida";
import { TarjetaResultado } from "../componentes/TarjetaResultado";
import PaginaAdmin from "./Admin";
import PaginaPrestador from "./Prestador";
import PaginaServicio from "./Servicio";
import PaginaMisValoraciones from "./mi/MisValoraciones";

const clienteUsuario = { id: "c1", correo: "ana@ejemplo.cl", nombre: "Ana Pérez", rol: "CLIENTE", correoVerificado: true };
const prestadorUsuario = { id: "p1", correo: "pedro@ejemplo.cl", nombre: "Pedro Soto", rol: "PRESTADOR", correoVerificado: true };
const admin = { id: "a1", correo: "admin@ejemplo.cl", nombre: "Admin", rol: "ADMINISTRADOR", correoVerificado: true };

type Usuario = typeof clienteUsuario | typeof prestadorUsuario | typeof admin;

const SANTIAGO = { id: 13101, nombre: "Santiago", region: { id: 13, nombre: "Metropolitana de Santiago", orden: 7 } };

const SIN_VALORACIONES = { cantidad: 0, promedio: null, distribucion: null };
const DOS = { cantidad: 2, promedio: null, distribucion: null };
const TRES = { cantidad: 3, promedio: 4.3, distribucion: { "1": 0, "2": 0, "3": 0, "4": 2, "5": 1 } };

function servicio(valoraciones: object) {
  return {
    id: "s1",
    titulo: "Gasfitería a domicilio",
    descripcion: "Reparación de calefont, filtraciones y destapes.",
    precioDesde: 25000,
    precioHasta: null,
    unidadPrecio: "POR_SERVICIO",
    categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
    categoriaPersonalizada: null,
    imagenes: [],
    prestador: {
      id: "perfil-1",
      nombre: "Pedro Soto",
      comunas: [],
      conCertificaciones: false,
      certificaciones: [],
      cursos: [],
      valoraciones,
    },
  };
}

const LISTA = {
  resumen: TRES,
  valoraciones: [
    { id: "v1", calificacion: 5, comentario: "Impecable, muy puntual.", creadaEn: "2026-11-01T12:00:00Z", editada: true, cliente: { nombre: "Camila", foto: null } },
    { id: "v2", calificacion: 4, comentario: null, creadaEn: "2026-10-20T12:00:00Z", editada: false, cliente: { nombre: "Matías", foto: null } },
  ],
  pagina: 1,
  porPagina: 10,
  total: 2,
};

function json(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

interface Escenario {
  usuario?: Usuario | null;
  resumen?: object;
  mia?: object;
  respuestaValorar?: Response;
  recibidas?: object[];
  cola?: object[];
}

function simularApi({ usuario = null, resumen = TRES, mia, respuestaValorar, recibidas = [], cola = [] }: Escenario = {}) {
  vi.mocked(fetch).mockImplementation(async (entrada, opciones) => {
    const url = String(entrada);
    const metodo = opciones?.method ?? "GET";

    if (url === "/api/auth/refrescar") {
      return usuario ? json({ accessToken: "t", usuario }) : json({ error: { codigo: "SESION_INVALIDA" } }, 401);
    }
    if (url === "/api/auth/yo") return json({ usuario });
    if (url === "/api/servicios/s1") return json({ servicio: servicio(resumen) });
    if (url.startsWith("/api/prestadores/perfil-1/valoraciones?")) return json({ ...LISTA, resumen });
    if (url === "/api/prestadores/perfil-1/valoraciones/mia" && metodo === "GET") {
      return json(mia ?? { valoracion: null, puedeValorar: false, motivo: "SIN_CONTACTO", plazoHasta: null });
    }
    if (url === "/api/prestadores/perfil-1/valoraciones" && metodo === "POST") {
      return (
        respuestaValorar ??
        json({ valoracion: { id: "nueva", calificacion: 4, comentario: null, estado: "PUBLICADA", ocultaPorModeracion: false, creadaEn: "2026-11-10T12:00:00Z", editada: false } }, 201)
      );
    }
    if (url === "/api/prestadores/perfil-1/publico") {
      return json({
        prestador: {
          id: "perfil-1",
          nombre: "Pedro Soto",
          descripcion: "Gasfíter.",
          comunas: [],
          conCertificaciones: false,
          certificaciones: [],
          cursos: [],
          valoraciones: resumen,
          servicios: [],
        },
      });
    }
    if (url === "/api/prestadores/yo") {
      return json({ perfil: { id: "perfil-1", descripcion: "Gasfíter.", telefono: "+56912345678", radioAtencionKm: 10, comuna: SANTIAGO, comunasAtencion: [SANTIAGO] } });
    }
    if (url === "/api/prestadores/yo/identidad") return json({ identidad: null, cargasDisponibles: 3 });
    if (url === "/api/servicios/mios") return json({ servicios: [], requisitosPendientes: [] });
    if (url === "/api/prestadores/yo/certificaciones") return json({ certificaciones: [] });
    if (url.startsWith("/api/prestadores/yo/valoraciones")) {
      return json({ resumen: DOS, valoraciones: recibidas, pagina: 1, porPagina: 10, total: recibidas.length });
    }
    if (/\/api\/valoraciones\/[^/]+\/objecion$/.test(url)) return json({ mensaje: "Recibimos tu objeción." }, 201);
    if (url === "/api/admin/resumen") return json({ resumen: { totalUsuarios: 3, porRol: { CLIENTE: 1, PRESTADOR: 1, ADMINISTRADOR: 1 } } });
    if (url.startsWith("/api/admin/identidades")) return json({ identidades: [], pagina: 1, porPagina: 10, total: 0 });
    if (url.startsWith("/api/admin/imagenes")) return json({ imagenes: [], pagina: 1, porPagina: 20, total: 0 });
    if (url.startsWith("/api/admin/certificaciones")) return json({ certificaciones: [], pagina: 1, porPagina: 10, total: 0 });
    if (url === "/api/admin/reportes?estado=pendientes") return json({ casos: cola, pagina: 1, porPagina: 20, total: cola.length });
    if (url === "/api/admin/reportes?estado=resueltos") return json({ casos: [], pagina: 1, porPagina: 20, total: 0 });
    if (/\/api\/admin\/reportes\/valoraciones\/[^/]+\/(desestimar|ocultar)$/.test(url)) {
      return json({ valoracion: { id: "v9", estado: "OCULTA" }, accion: "OCULTAR_VALORACION", motivo: "x" });
    }
    return json({ error: { codigo: "NO_ENCONTRADO" } }, 404);
  });
}

function llamadas(metodo: string, patron: RegExp) {
  return vi.mocked(fetch).mock.calls.filter(([url, opciones]) => (opciones?.method ?? "GET") === metodo && patron.test(String(url)));
}

function renderizar(ruta: string, cliente: ClienteApi = crearClienteApi()) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorAuth cliente={cliente}>
        <Routes>
          <Route path="/servicios/:id" element={<PaginaServicio cliente={cliente} />} />
          <Route path="/prestadores/:id" element={<PaginaPrestador cliente={cliente} />} />
          <Route path="/mi" element={<RutaProtegida roles={["PRESTADOR"]}><AreaPrestador /></RutaProtegida>}>
            <Route path="valoraciones" element={<PaginaMisValoraciones />} />
          </Route>
          <Route path="/admin" element={<RutaProtegida><PaginaAdmin cliente={cliente} /></RutaProtegida>} />
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

describe("Resumen de valoraciones", () => {
  it("sin valoraciones dice «Aún sin valoraciones», nunca un cero", async () => {
    simularApi({ resumen: SIN_VALORACIONES });
    renderizar("/servicios/s1");

    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText(/aún sin valoraciones/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0[,.]0$/)).not.toBeInTheDocument();
  });

  it("con 2 muestra el conteo y no un promedio", async () => {
    simularApi({ resumen: DOS });
    renderizar("/servicios/s1");

    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText("2 valoraciones").length).toBeGreaterThan(0);
    expect(screen.queryByRole("list", { name: "Distribución por estrella" })).not.toBeInTheDocument();
  });

  it("con 3 muestra el promedio junto al nombre, la distribución y la lista", async () => {
    simularApi({ resumen: TRES });
    renderizar("/servicios/s1");

    expect(await screen.findByText("4,3 de 5 · 3 valoraciones")).toBeInTheDocument();
    const distribucion = await screen.findByRole("list", { name: "Distribución por estrella" });
    expect(within(distribucion).getAllByRole("listitem")).toHaveLength(5);
    const lista = screen.getByRole("list", { name: "Lista de valoraciones" });
    expect(within(lista).getByText("Camila")).toBeInTheDocument();
    expect(within(lista).getByText(/editada/i)).toBeInTheDocument();
  });

  it("la tarjeta del buscador muestra el promedio o el conteo", () => {
    const resultado: ResultadoBusqueda = {
      id: "s1",
      titulo: "Gasfitería a domicilio",
      categoria: { slug: "gasfiteria", nombre: "Gasfitería" },
      categoriaPersonalizada: null,
      precioDesde: null,
      precioHasta: null,
      unidadPrecio: null,
      imagen: null,
      prestador: { nombre: "Pedro Soto", comunas: [], comunasRestantes: 0, conCertificaciones: false, valoraciones: { cantidad: 5, promedio: 4.6 } },
      coincidencia: null,
    };
    const { rerender } = render(
      <MemoryRouter>
        <TarjetaResultado resultado={resultado} />
      </MemoryRouter>,
    );
    expect(screen.getByText("4,6 de 5 · 5 valoraciones")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <TarjetaResultado resultado={{ ...resultado, prestador: { ...resultado.prestador, valoraciones: { cantidad: 1, promedio: null } } }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("1 valoración")).toBeInTheDocument();
  });

  it("el perfil del prestador muestra el resumen y la distribución", async () => {
    simularApi({ resumen: TRES });
    renderizar("/prestadores/perfil-1");

    expect(await screen.findByRole("list", { name: "Distribución por estrella" })).toBeInTheDocument();
    expect(screen.getByText("4,3 de 5 · 3 valoraciones")).toBeInTheDocument();
  });
});

describe("Formulario para valorar", () => {
  it("sin sesión explica el requisito y no muestra un formulario", async () => {
    simularApi({ usuario: null });
    renderizar("/servicios/s1");

    const seccion = await screen.findByRole("region", { name: /valorar a pedro soto/i });
    expect(within(seccion).getByText(/valoran quienes contactaron/i)).toBeInTheDocument();
    expect(within(seccion).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("un cliente sin contacto ve el requisito, sin nada sobre las valoraciones de otros", async () => {
    simularApi({ usuario: clienteUsuario });
    renderizar("/servicios/s1");

    const seccion = await screen.findByRole("region", { name: /valorar a pedro soto/i });
    expect(await within(seccion).findByText(/primero contáctalo/i)).toBeInTheDocument();
    expect(within(seccion).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(seccion).queryByText("Camila")).not.toBeInTheDocument();
  });

  it("el selector de estrellas es un grupo de radios con valores anunciados, usable con teclado", async () => {
    simularApi({ usuario: clienteUsuario, mia: { valoracion: null, puedeValorar: true, motivo: null, plazoHasta: "2026-12-30T12:00:00Z" } });
    renderizar("/servicios/s1");

    const grupo = await screen.findByRole("group", { name: "Tu calificación" });
    const radios = within(grupo).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(within(grupo).getByRole("radio", { name: "1 estrella" })).toBeInTheDocument();
    expect(within(grupo).getByRole("radio", { name: "4 estrellas" })).toBeInTheDocument();

    // Con el teclado: el foco en un radio y la selección con la barra/flechas cambian el valor (evento change nativo).
    const cuatro = within(grupo).getByRole("radio", { name: "4 estrellas" });
    cuatro.focus();
    fireEvent.click(cuatro);
    expect(cuatro).toBeChecked();
    expect(cuatro).toHaveFocus();
  });

  it("publica tras confirmar (es definitiva) y la deja solo para leer, sin editar ni retirar", async () => {
    simularApi({ usuario: clienteUsuario, mia: { valoracion: null, puedeValorar: true, motivo: null, plazoHasta: "2026-12-30T12:00:00Z" } });
    renderizar("/servicios/s1");

    fireEvent.click(await screen.findByRole("radio", { name: "4 estrellas" }));
    fireEvent.change(screen.getByLabelText("Comentario (opcional)"), { target: { value: "Muy buen trabajo, recomendado." } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar valoración" }));

    // Primero pide confirmar, sin enviar nada todavía.
    const confirmacion = await screen.findByRole("group", { name: "Confirmar publicación" });
    expect(confirmacion).toHaveTextContent(/4 estrellas.*no podrás editarla ni retirarla/i);
    expect(llamadas("POST", /valoraciones$/)).toHaveLength(0);
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Sí, publicar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/tu valoración ya está publicada/i);
    const [llamada] = llamadas("POST", /\/api\/prestadores\/perfil-1\/valoraciones$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ calificacion: 4, comentario: "Muy buen trabajo, recomendado." });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publicar|guardar|retirar/i })).not.toBeInTheDocument();
  });

  it("«Volver a revisar» cancela la confirmación sin enviar", async () => {
    simularApi({ usuario: clienteUsuario, mia: { valoracion: null, puedeValorar: true, motivo: null, plazoHasta: null } });
    renderizar("/servicios/s1");

    fireEvent.click(await screen.findByRole("radio", { name: "2 estrellas" }));
    fireEvent.click(screen.getByRole("button", { name: "Publicar valoración" }));
    fireEvent.click(await screen.findByRole("button", { name: "Volver a revisar" }));

    expect(screen.getByRole("button", { name: "Publicar valoración" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2 estrellas" })).toBeChecked();
    expect(llamadas("POST", /valoraciones$/)).toHaveLength(0);
  });

  it("sin estrellas o con un comentario de 9 caracteres avisa antes de enviar", async () => {
    simularApi({ usuario: clienteUsuario, mia: { valoracion: null, puedeValorar: true, motivo: null, plazoHasta: null } });
    renderizar("/servicios/s1");

    await screen.findByRole("group", { name: "Tu calificación" });
    fireEvent.change(screen.getByLabelText("Comentario (opcional)"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar valoración" }));

    expect(await screen.findByText("Elige de 1 a 5 estrellas.")).toBeInTheDocument();
    expect(screen.getByLabelText("Comentario (opcional)")).toHaveAccessibleDescription(/al menos 10 caracteres/i);
    expect(llamadas("POST", /valoraciones$/)).toHaveLength(0);
  });

  it("si ya valoró, la ve solo para leer: sin formulario ni botones de editar o retirar", async () => {
    simularApi({
      usuario: clienteUsuario,
      mia: {
        valoracion: { id: "v1", calificacion: 3, comentario: "Cumplió, pero tarde.", estado: "PUBLICADA", ocultaPorModeracion: false, creadaEn: "2026-11-01T12:00:00Z", editada: false },
        puedeValorar: false,
        motivo: "YA_VALORADA",
        plazoHasta: null,
      },
    });
    renderizar("/servicios/s1");

    const seccion = await screen.findByRole("region", { name: "Tu valoración" });
    expect(within(seccion).getByText("Cumplió, pero tarde.")).toBeInTheDocument();
    expect(within(seccion).getByText("3 de 5")).toBeInTheDocument();
    expect(within(seccion).getByText(/no se pueden editar ni retirar/i)).toBeInTheDocument();
    expect(within(seccion).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(seccion).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(seccion).queryByRole("button")).not.toBeInTheDocument();
  });

  it("si fue ocultada por moderación, el cliente lo ve y no puede editarla", async () => {
    simularApi({
      usuario: clienteUsuario,
      mia: {
        valoracion: { id: "v1", calificacion: 1, comentario: "Texto moderado por las normas.", estado: "OCULTA", ocultaPorModeracion: true, creadaEn: "2026-11-01T12:00:00Z", editada: false },
        puedeValorar: false,
        motivo: "YA_VALORADA",
        plazoHasta: null,
      },
    });
    renderizar("/servicios/s1");

    expect(await screen.findByText(/ocultada por moderación/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar cambios|publicar valoración/i })).not.toBeInTheDocument();
  });
});

describe("Valoraciones recibidas del prestador (/mi/valoraciones)", () => {
  const RECIBIDA = {
    id: "v9",
    calificacion: 1,
    comentario: "Pésimo, no lo recomiendo para nada.",
    estado: "PUBLICADA",
    creadaEn: "2026-11-01T12:00:00Z",
    editada: false,
    cliente: { nombre: "Diego" },
    objecion: null,
    retirada: null,
  };

  it("no ofrece borrar ni ocultar: solo objetar, con motivo cerrado", async () => {
    simularApi({ usuario: prestadorUsuario, recibidas: [RECIBIDA] });
    renderizar("/mi/valoraciones");

    const lista = await screen.findByRole("list", { name: "Valoraciones recibidas" });
    expect(within(lista).queryByRole("button", { name: /eliminar|borrar|ocultar/i })).not.toBeInTheDocument();

    fireEvent.click(within(lista).getByRole("button", { name: "Objetar esta valoración" }));
    fireEvent.click(within(lista).getByRole("radio", { name: /información falsa/i }));
    fireEvent.click(within(lista).getByRole("button", { name: "Enviar objeción" }));

    await waitFor(() => expect(llamadas("POST", /\/api\/valoraciones\/v9\/objecion$/)).toHaveLength(1));
    const [llamada] = llamadas("POST", /objecion$/);
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ motivo: "INFORMACION_FALSA", comentario: null });
  });

  it("con «Otro» exige comentario antes de enviar", async () => {
    simularApi({ usuario: prestadorUsuario, recibidas: [RECIBIDA] });
    renderizar("/mi/valoraciones");

    fireEvent.click(await screen.findByRole("button", { name: "Objetar esta valoración" }));
    fireEvent.click(screen.getByRole("radio", { name: /^otro/i }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar objeción" }));

    expect(await screen.findByLabelText("Comentario")).toHaveAccessibleDescription(/al menos 10 caracteres/i);
    expect(llamadas("POST", /objecion$/)).toHaveLength(0);
  });

  it("muestra el estado de la objeción y, si se ocultó, el motivo", async () => {
    simularApi({
      usuario: prestadorUsuario,
      recibidas: [
        { ...RECIBIDA, id: "a", objecion: { motivo: "LENGUAJE_OFENSIVO", comentario: null, estado: "ABIERTA", enviadaEn: "2026-11-02T12:00:00Z", resolucion: null, decididaEn: null } },
        {
          ...RECIBIDA,
          id: "b",
          estado: "OCULTA",
          objecion: { motivo: "DATOS_PERSONALES_EXPUESTOS", comentario: null, estado: "RESUELTA", enviadaEn: "2026-11-02T12:00:00Z", resolucion: "Expone una dirección.", decididaEn: "2026-11-03T12:00:00Z" },
          retirada: { motivo: "Expone una dirección.", en: "2026-11-03T12:00:00Z" },
        },
      ],
    });
    renderizar("/mi/valoraciones");

    const lista = await screen.findByRole("list", { name: "Valoraciones recibidas" });
    expect(within(lista).getByText(/objeción en revisión/i)).toBeInTheDocument();
    expect(within(lista).getByText(/retirada por moderación/i)).toBeInTheDocument();
    expect(within(lista).getByText(/expone una dirección/i)).toBeInTheDocument();
    // Ya objetadas: no se ofrece objetar de nuevo.
    expect(within(lista).queryByRole("button", { name: "Objetar esta valoración" })).not.toBeInTheDocument();
  });
});

describe("Valoraciones objetadas en la cola del administrador", () => {
  const CASO = {
    tipo: "VALORACION",
    valoracion: { id: "v9", calificacion: 1, comentario: "Pésimo, es un ladrón.", estado: "PUBLICADA", editada: false, prestador: "Pedro Soto" },
    objecion: { motivo: "LENGUAJE_OFENSIVO", comentario: "Me insulta sin razón." },
    personas: 1,
    reportes: 1,
    motivoFrecuente: "LENGUAJE_OFENSIVO",
    prioridad: "NORMAL",
    primerReporte: "2026-11-02T12:00:00Z",
    esperaMinutos: 120,
    decision: null,
  };

  it("muestra el texto, la calificación y el motivo; ocultar exige motivo", async () => {
    simularApi({ usuario: admin, cola: [CASO] });
    renderizar("/admin");

    const tarjeta = await screen.findByRole("article", { name: "Valoración objetada por Pedro Soto" });
    expect(within(tarjeta).getByText("«Pésimo, es un ladrón.»")).toBeInTheDocument();
    expect(within(tarjeta).getByText("1 de 5")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Lenguaje ofensivo")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/me insulta sin razón/i)).toBeInTheDocument();

    fireEvent.click(within(tarjeta).getByRole("button", { name: "Ocultar valoración" }));
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Ocultar valoración" }));
    expect(await within(tarjeta).findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(llamadas("PATCH", /valoraciones\/v9\/ocultar$/)).toHaveLength(0);

    fireEvent.change(within(tarjeta).getByLabelText("Motivo de la decisión"), { target: { value: "Contiene un insulto directo." } });
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Ocultar valoración" }));
    await waitFor(() => expect(llamadas("PATCH", /\/api\/admin\/reportes\/valoraciones\/v9\/ocultar$/)).toHaveLength(1));
  });
});
