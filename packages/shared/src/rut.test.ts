import { describe, expect, it } from "vitest";
import { esRutValido, formatearRut, normalizarRut } from "./rut.js";

// RUT real de referencia: 12.345.678-5 tiene dígito verificador correcto.
const RUT_VALIDO = "12345678-5";

describe("normalizarRut", () => {
  it("quita los puntos y deja el guion", () => {
    expect(normalizarRut("12.345.678-5")).toBe(RUT_VALIDO);
  });

  it("agrega el guion cuando viene todo junto", () => {
    expect(normalizarRut("123456785")).toBe(RUT_VALIDO);
  });

  it("pasa la k a mayúscula", () => {
    expect(normalizarRut("10.000.013-k")).toBe("10000013-K");
  });

  it("deja la K mayúscula tal cual", () => {
    expect(normalizarRut("10000013-K")).toBe("10000013-K");
  });

  it("elimina los ceros a la izquierda", () => {
    expect(normalizarRut("0012345678-5")).toBe(RUT_VALIDO);
  });

  it("ignora los espacios sobrantes", () => {
    expect(normalizarRut("  12 345 678 - 5  ")).toBe(RUT_VALIDO);
  });

  it("devuelve cadena vacía cuando no hay nada que normalizar", () => {
    expect(normalizarRut("")).toBe("");
    expect(normalizarRut("   ")).toBe("");
    expect(normalizarRut("-")).toBe("");
  });

  it("devuelve cadena vacía si solo queda el dígito verificador", () => {
    // "0000-5" se queda sin cuerpo al sacar los ceros a la izquierda.
    expect(normalizarRut("0000-5")).toBe("");
  });
});

describe("esRutValido", () => {
  it("acepta un RUT válido escrito con puntos", () => {
    expect(esRutValido("12.345.678-5")).toBe(true);
  });

  it("acepta el mismo RUT sin puntos ni guion", () => {
    expect(esRutValido("123456785")).toBe(true);
  });

  it("acepta un dígito verificador K en mayúscula", () => {
    expect(esRutValido("10.000.013-K")).toBe(true);
  });

  it("acepta el mismo dígito verificador en minúscula", () => {
    expect(esRutValido("10.000.013-k")).toBe(true);
  });

  it("acepta un cuerpo de siete dígitos", () => {
    expect(esRutValido("7.654.321-6")).toBe(true);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    // El dígito correcto de 12345678 es 5, no 9.
    expect(esRutValido("12.345.678-9")).toBe(false);
  });

  it("rechaza un RUT válido con un dígito del cuerpo alterado", () => {
    // Misma longitud y mismo verificador, un solo dígito distinto: es el caso
    // que un control de formato dejaría pasar y el módulo 11 sí detecta.
    expect(esRutValido(RUT_VALIDO)).toBe(true);
    expect(esRutValido("12345679-5")).toBe(false);
  });

  it("rechaza un formato inválido", () => {
    expect(esRutValido("no-es-un-rut")).toBe(false);
    expect(esRutValido("12.345.678-KK")).toBe(false);
    expect(esRutValido("1K345678-5")).toBe(false);
  });

  it("rechaza la cadena vacía", () => {
    expect(esRutValido("")).toBe(false);
    expect(esRutValido("   ")).toBe(false);
  });

  it("rechaza un RUT demasiado corto aunque el verificador cuadre", () => {
    // 123456-0 pasa el módulo 11, pero seis dígitos no son un RUT en uso.
    expect(esRutValido("123456-0")).toBe(false);
  });

  it("rechaza un RUT demasiado largo aunque el verificador cuadre", () => {
    expect(esRutValido("123456789-2")).toBe(false);
  });
});

describe("formatearRut", () => {
  it("agrega los puntos de miles a la forma canónica", () => {
    expect(formatearRut("12345678-5")).toBe("12.345.678-5");
    expect(formatearRut("1234567-4")).toBe("1.234.567-4");
    expect(formatearRut("10000013-K")).toBe("10.000.013-K");
  });

  it("acepta cualquier escritura y la normaliza antes", () => {
    expect(formatearRut("12.345.678-5")).toBe("12.345.678-5");
    expect(formatearRut("123456785")).toBe("12.345.678-5");
  });

  it("devuelve vacío si no hay un RUT", () => {
    expect(formatearRut("")).toBe("");
  });
});
