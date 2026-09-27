import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estaFiltrada } from "../../src/modules/auth/auth.filtradas.js";
import { env } from "../../src/env.js";

/**
 * El entorno de pruebas tiene REVISAR_CONTRASENAS_FILTRADAS=false para que las
 * pruebas de integración no dependan de la red. Acá se enciende a mano y se
 * simula fetch, que es lo que permite comprobar el comportamiento del módulo
 * sin salir a internet ni depender de que HIBP esté disponible.
 */
const CONTRASENA = "contrasena-de-prueba";
const HASH = createHash("sha1").update(CONTRASENA).digest("hex").toUpperCase();
const PREFIJO = HASH.slice(0, 5);
const SUFIJO = HASH.slice(5);

function respuesta(cuerpo: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => cuerpo } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(env, "REVISAR_CONTRASENAS_FILTRADAS", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Comprobación de contraseñas filtradas", () => {
  it("solo envía los cinco primeros caracteres del hash", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta(`${SUFIJO}:42`));

    await estaFiltrada(CONTRASENA);

    const [url, opciones] = vi.mocked(fetch).mock.calls[0] ?? [];

    expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${PREFIJO}`);
    // Lo esencial del k-anonimato: ni la contraseña ni el hash completo salen.
    expect(String(url)).not.toContain(SUFIJO);
    expect(String(url)).not.toContain(CONTRASENA);
    expect(opciones?.headers).toMatchObject({ "Add-Padding": "true" });
  });

  it("detecta la contraseña cuando su sufijo aparece con conteo mayor que cero", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta(`0000AAA:3\r\n${SUFIJO}:1874\r\nFFFFBBB:9`));

    expect(await estaFiltrada(CONTRASENA)).toBe(true);
  });

  it("ignora los sufijos de relleno, que vienen con conteo cero", async () => {
    // Con Add-Padding el servicio agrega resultados falsos en cero para que el
    // tamaño de la respuesta no delate cuántas coincidencias reales había.
    vi.mocked(fetch).mockResolvedValue(respuesta(`${SUFIJO}:0\r\n0000AAA:5`));

    expect(await estaFiltrada(CONTRASENA)).toBe(false);
  });

  it("devuelve false cuando el sufijo no está en la lista", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta("0000AAA:3\r\nFFFFBBB:9"));

    expect(await estaFiltrada(CONTRASENA)).toBe(false);
  });

  it("no bloquea el registro si el servicio falla", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("red caída"));

    // Que HIBP esté inalcanzable no puede impedir que alguien cree su cuenta.
    expect(await estaFiltrada(CONTRASENA)).toBe(false);
  });

  it("no bloquea el registro si el servicio responde con error", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta("", false, 503));

    expect(await estaFiltrada(CONTRASENA)).toBe(false);
  });

  it("no consulta nada cuando la comprobación está apagada", async () => {
    vi.spyOn(env, "REVISAR_CONTRASENAS_FILTRADAS", "get").mockReturnValue(false);

    expect(await estaFiltrada(CONTRASENA)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
