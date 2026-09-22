import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteApi, ErrorApi } from "./cliente";

const usuario = { id: "u1", correo: "ana@ejemplo.cl", nombre: "Ana", rol: "CLIENTE" };

function json(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

function rutaDe(llamada: Parameters<typeof fetch>): string {
  return String(llamada[0]);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente de la API", () => {
  it("antepone /api y manda el token en la cabecera Authorization", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ accessToken: "token-1", usuario }))
      .mockResolvedValueOnce(json({ usuario }));

    await cliente.iniciarSesion("ana@ejemplo.cl", "contrasena-segura-123");
    await cliente.obtenerPerfil();

    const [rutaLogin] = vi.mocked(fetch).mock.calls[0] ?? [];
    const [rutaPerfil, opcionesPerfil] = vi.mocked(fetch).mock.calls[1] ?? [];

    expect(rutaLogin).toBe("/api/auth/login");
    expect(rutaPerfil).toBe("/api/auth/yo");
    expect(opcionesPerfil?.headers).toMatchObject({ Authorization: "Bearer token-1" });
  });

  it("traduce el error de la API a ErrorApi con sus detalles por campo", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch).mockResolvedValue(
      json(
        {
          error: {
            codigo: "DATOS_INVALIDOS",
            mensaje: "Los datos enviados no son válidos.",
            detalles: [{ campo: "contrasena", mensaje: "Muy corta." }],
          },
        },
        400,
      ),
    );

    const error = await cliente
      .registrar({ nombre: "Ana", correo: "ana@ejemplo.cl", contrasena: "corta" })
      .catch((causa: unknown) => causa);

    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).codigo).toBe("DATOS_INVALIDOS");
    expect((error as ErrorApi).mensajeDe("contrasena")).toBe("Muy corta.");
  });

  it("ante un 401 refresca una vez y reintenta la petición", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: { codigo: "TOKEN_INVALIDO" } }, 401))
      .mockResolvedValueOnce(json({ accessToken: "token-nuevo", usuario }))
      .mockResolvedValueOnce(json({ usuario }));

    const perfil = await cliente.obtenerPerfil();

    expect(perfil.correo).toBe("ana@ejemplo.cl");

    const rutas = vi.mocked(fetch).mock.calls.map(rutaDe);
    expect(rutas).toEqual(["/api/auth/yo", "/api/auth/refrescar", "/api/auth/yo"]);

    // El reintento va con el token recién obtenido.
    const [, opcionesReintento] = vi.mocked(fetch).mock.calls[2] ?? [];
    expect(opcionesReintento?.headers).toMatchObject({ Authorization: "Bearer token-nuevo" });
  });

  it("no reintenta indefinidamente si el 401 persiste tras refrescar", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: { codigo: "TOKEN_INVALIDO" } }, 401))
      .mockResolvedValueOnce(json({ accessToken: "token-nuevo", usuario }))
      .mockResolvedValueOnce(json({ error: { codigo: "TOKEN_INVALIDO" } }, 401));

    await expect(cliente.obtenerPerfil()).rejects.toBeInstanceOf(ErrorApi);

    expect(vi.mocked(fetch).mock.calls.filter((c) => rutaDe(c) === "/api/auth/refrescar")).toHaveLength(1);
  });

  it("dos peticiones que reciben 401 a la vez comparten un ÚNICO refresco", async () => {
    // Si cada una refrescara por su cuenta, la API recibiría dos veces el
    // mismo token de refresco, lo interpretaría como robo y revocaría todas
    // las sesiones del usuario.
    const cliente = crearClienteApi();

    let refrescos = 0;
    let perfilesPedidos = 0;

    vi.mocked(fetch).mockImplementation(async (url) => {
      const ruta = String(url);

      if (ruta === "/api/auth/refrescar") {
        refrescos += 1;
        // Demora deliberada: deja a las dos peticiones esperando en paralelo.
        await new Promise((resolver) => setTimeout(resolver, 20));
        return json({ accessToken: "token-nuevo", usuario });
      }

      perfilesPedidos += 1;
      // Los dos primeros intentos van con el token vencido.
      return perfilesPedidos <= 2
        ? json({ error: { codigo: "TOKEN_INVALIDO" } }, 401)
        : json({ usuario });
    });

    const [primero, segundo] = await Promise.all([
      cliente.obtenerPerfil(),
      cliente.obtenerPerfil(),
    ]);

    expect(refrescos).toBe(1);
    expect(primero.correo).toBe("ana@ejemplo.cl");
    expect(segundo.correo).toBe("ana@ejemplo.cl");
  });

  it("permite un refresco nuevo una vez que terminó el anterior", async () => {
    // La promesa compartida se libera al completarse: si no, tras el primer
    // refresco la sesión no podría renovarse nunca más.
    const cliente = crearClienteApi();

    vi.mocked(fetch).mockResolvedValue(json({ accessToken: "token-nuevo", usuario }));

    await cliente.restaurarSesion();
    await cliente.restaurarSesion();

    const refrescos = vi
      .mocked(fetch)
      .mock.calls.filter((llamada) => rutaDe(llamada) === "/api/auth/refrescar");

    expect(refrescos).toHaveLength(2);
  });

  it("devuelve null al restaurar si la cookie ya no sirve", async () => {
    const cliente = crearClienteApi();

    vi.mocked(fetch).mockResolvedValue(json({ error: { codigo: "SESION_INVALIDA" } }, 401));

    expect(await cliente.restaurarSesion()).toBeNull();
  });
});
