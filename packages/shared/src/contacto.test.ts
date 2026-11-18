import { describe, expect, it } from "vitest";
import { mensajeContactoWhatsApp, nombreDePila } from "./contacto.js";

const BASE = { nombrePrestador: "Pedro Soto", tituloServicio: "Gasfitería a domicilio" };

describe("nombreDePila", () => {
  it("toma solo el primer nombre, sin espacios sobrantes", () => {
    expect(nombreDePila("  Ana   María Pérez Soto ")).toBe("Ana");
    expect(nombreDePila("Ana")).toBe("Ana");
    expect(nombreDePila("   ")).toBe("");
  });
});

describe("mensajeContactoWhatsApp", () => {
  it("sin sesión: el mensaje de siempre, exactamente, sin nombre", () => {
    expect(mensajeContactoWhatsApp(BASE)).toBe("Hola Pedro Soto, te escribo desde LocalCL por tu servicio «Gasfitería a domicilio».");
    expect(mensajeContactoWhatsApp({ ...BASE, nombreCliente: null })).toBe(mensajeContactoWhatsApp(BASE));
  });

  it("con sesión: incluye el nombre de pila del cliente", () => {
    expect(mensajeContactoWhatsApp({ ...BASE, nombreCliente: "Ana María Pérez Soto" })).toBe(
      "Hola Pedro Soto, soy Ana y te escribo desde LocalCL por tu servicio «Gasfitería a domicilio».",
    );
  });

  it("nunca incluye el nombre completo: ni el segundo nombre ni los apellidos", () => {
    const mensaje = mensajeContactoWhatsApp({ ...BASE, nombreCliente: "Ana María Fuentes Rojas" });
    for (const parte of ["María", "Fuentes", "Rojas"]) expect(mensaje).not.toContain(parte);
  });

  it("un nombre vacío o de solo espacios se trata como sin sesión", () => {
    expect(mensajeContactoWhatsApp({ ...BASE, nombreCliente: "   " })).toBe(mensajeContactoWhatsApp(BASE));
    expect(mensajeContactoWhatsApp({ ...BASE, nombreCliente: "" })).toBe(mensajeContactoWhatsApp(BASE));
  });
});
