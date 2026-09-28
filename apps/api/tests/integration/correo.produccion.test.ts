import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/env.js";
import {
  EnviadorProduccion,
  partirRemitente,
} from "../../src/modules/correo/correo.produccion.js";
import { correoRecuperacion } from "../../src/modules/correo/correo.plantillas.js";

/**
 * El adaptador se prueba con fetch simulado: no hace falta una clave real ni
 * salir a internet, y además permite afirmar cosas que contra el servicio real
 * serían imposibles de comprobar, como qué cabecera lleva la credencial.
 */
function respuesta(ok: boolean, status: number, cuerpo = ""): Response {
  return { ok, status, text: async () => cuerpo } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(env, "CORREO_API_CLAVE", "get").mockReturnValue("clave-de-prueba");
  vi.spyOn(env, "CORREO_REMITENTE", "get").mockReturnValue("LocalCL <avisos@ejemplo.cl>");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("partirRemitente", () => {
  it("separa el nombre de la dirección", () => {
    expect(partirRemitente("LocalCL <avisos@ejemplo.cl>")).toEqual({
      nombre: "LocalCL",
      correo: "avisos@ejemplo.cl",
    });
  });

  it("acepta una dirección pelada", () => {
    expect(partirRemitente("avisos@ejemplo.cl")).toEqual({
      nombre: "LocalCL",
      correo: "avisos@ejemplo.cl",
    });
  });

  it("pone un nombre por defecto si viene vacío", () => {
    expect(partirRemitente("<avisos@ejemplo.cl>").nombre).toBe("LocalCL");
  });
});

describe("Transporte de producción", () => {
  it("manda la credencial en la cabecera y no en la URL", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta(true, 201));

    await new EnviadorProduccion().enviar(correoRecuperacion("ana@ejemplo.cl", "tok123"));

    const [url, opciones] = vi.mocked(fetch).mock.calls[0] ?? [];

    expect(String(url)).toBe("https://api.brevo.com/v3/smtp/email");
    // Una clave en la URL terminaría en registros de servidores intermedios.
    expect(String(url)).not.toContain("clave-de-prueba");
    expect(opciones?.headers).toMatchObject({ "api-key": "clave-de-prueba" });
  });

  it("arma el cuerpo con el remitente separado y el texto plano", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta(true, 201));

    await new EnviadorProduccion().enviar(correoRecuperacion("ana@ejemplo.cl", "tok123"));

    const [, opciones] = vi.mocked(fetch).mock.calls[0] ?? [];
    const cuerpo: unknown = JSON.parse(String(opciones?.body));

    expect(cuerpo).toMatchObject({
      sender: { name: "LocalCL", email: "avisos@ejemplo.cl" },
      to: [{ email: "ana@ejemplo.cl" }],
      subject: "Recupera el acceso a tu cuenta de LocalCL",
    });
  });

  it("lanza con el detalle del proveedor cuando el envío se rechaza", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta(false, 401, '{"code":"unauthorized","message":"Key not found"}'),
    );

    // El detalle importa: es lo que distingue una clave inválida de un
    // remitente sin verificar, que son los dos errores habituales al empezar.
    await expect(
      new EnviadorProduccion().enviar(correoRecuperacion("ana@ejemplo.cl", "tok123")),
    ).rejects.toThrow(/401.*unauthorized/s);
  });

  it("propaga el fallo de red para que quede en el log del servidor", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("sin red"));

    // enviar() lanza, y de contenerlo se encarga enviarSinInterrumpir().
    await expect(
      new EnviadorProduccion().enviar(correoRecuperacion("ana@ejemplo.cl", "tok123")),
    ).rejects.toThrow();
  });

  it("no registra el token en el mensaje de error", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta(false, 400, '{"message":"sender not valid"}'));

    const error = await new EnviadorProduccion()
      .enviar(correoRecuperacion("ana@ejemplo.cl", "token-secreto-123"))
      .catch((causa: unknown) => causa);

    // El enlace es una credencial de un solo uso: no puede terminar en el log.
    expect(String(error)).not.toContain("token-secreto-123");
  });
});
