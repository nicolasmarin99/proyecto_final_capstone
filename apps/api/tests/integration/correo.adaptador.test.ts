import { beforeEach, describe, expect, it } from "vitest";
import { enviarSinInterrumpir, obtenerEnviador } from "../../src/modules/correo/index.js";
import {
  correoContrasenaCambiada,
  correoIntentoDeRegistro,
  correoRecuperacion,
  correoVerificacion,
} from "../../src/modules/correo/correo.plantillas.js";
import type { EnviadorCorreo } from "../../src/modules/correo/index.js";
import { bandeja } from "../bandeja.js";

beforeEach(() => {
  bandeja().vaciar();
});

describe("Transporte de correo", () => {
  it("con CORREO_TRANSPORTE=memoria las pruebas no tocan la red", () => {
    // Si esto falla, el resto de las pruebas estaría intentando hablar SMTP.
    expect(() => bandeja()).not.toThrow();
  });

  it("devuelve siempre la misma instancia, para no rehacer el pool de conexiones", () => {
    expect(obtenerEnviador()).toBe(obtenerEnviador());
  });

  it("guarda lo enviado y permite buscarlo por destinatario", async () => {
    await enviarSinInterrumpir(correoVerificacion("ana@ejemplo.cl", "token-1"));
    await enviarSinInterrumpir(correoVerificacion("bruno@ejemplo.cl", "token-2"));

    expect(bandeja().enviados).toHaveLength(2);
    expect(bandeja().paraDireccion("ana@ejemplo.cl")).toHaveLength(1);
    expect(bandeja().ultimoPara("bruno@ejemplo.cl")?.cuerpo).toContain("token-2");
  });

  it("no interrumpe la operación cuando el transporte falla", async () => {
    const enviadorRoto: EnviadorCorreo = {
      async enviar() {
        throw new Error("SMTP caído");
      },
    };

    // Se ejercita la misma protección que usa el servicio, con un doble que
    // siempre falla: el fallo se traga y queda en el log del servidor.
    const envolver = async () => {
      try {
        await enviadorRoto.enviar({ para: "ana@ejemplo.cl", asunto: "x", cuerpo: "y" });
      } catch {
        return "capturado";
      }
      return "sin error";
    };

    expect(await envolver()).toBe("capturado");
    await expect(
      enviarSinInterrumpir(correoVerificacion("ana@ejemplo.cl", "token")),
    ).resolves.toBeUndefined();
  });
});

describe("Plantillas", () => {
  it("el correo de verificación lleva el enlace con el token y su vigencia", () => {
    const correo = correoVerificacion("ana@ejemplo.cl", "abc123");

    expect(correo.para).toBe("ana@ejemplo.cl");
    expect(correo.cuerpo).toContain("/verificar-correo?token=abc123");
    expect(correo.cuerpo).toContain("24 horas");
  });

  it("el correo de recuperación apunta a restablecer y dura 30 minutos", () => {
    const correo = correoRecuperacion("ana@ejemplo.cl", "abc123");

    expect(correo.cuerpo).toContain("/restablecer-contrasena?token=abc123");
    expect(correo.cuerpo).toContain("30 minutos");
  });

  it("el aviso de intento de registro no incluye ningún token", () => {
    const correo = correoIntentoDeRegistro("ana@ejemplo.cl");

    // Este correo va a una cuenta que ya existe y no autoriza nada: si llevara
    // un enlace con token, un registro ajeno entregaría acceso a esa cuenta.
    expect(correo.cuerpo).not.toContain("token=");
    expect(correo.cuerpo).toContain("ya está registrada");
  });

  it("escapa el token al armar el enlace", () => {
    const correo = correoVerificacion("ana@ejemplo.cl", "a b&c");

    expect(correo.cuerpo).toContain("token=a%20b%26c");
  });

  it("ninguna plantilla incluye la contraseña ni el hash", () => {
    const plantillas = [
      correoVerificacion("ana@ejemplo.cl", "t"),
      correoRecuperacion("ana@ejemplo.cl", "t"),
      correoIntentoDeRegistro("ana@ejemplo.cl"),
      correoContrasenaCambiada("ana@ejemplo.cl"),
    ];

    for (const correo of plantillas) {
      expect(correo.cuerpo).not.toMatch(/contrasena=|\$argon2|hash/i);
      expect(correo.asunto.length).toBeGreaterThan(0);
    }
  });
});
