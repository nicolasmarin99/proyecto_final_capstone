import { describe, expect, it } from "vitest";
import { formatearTelefono, normalizarTelefono } from "./telefono.js";

const CANONICO = "+56912345678";

describe("normalizarTelefono", () => {
  it.each([
    ["9 1234 5678", "con espacios, como se dicta"],
    ["+56912345678", "ya en E.164"],
    ["56912345678", "con código de país sin el +"],
    ["912345678", "solo los nueve dígitos"],
    ["+56 9 1234 5678", "E.164 con espacios"],
    ["+56-9-1234-5678", "con guiones"],
    ["(+56) 9 1234.5678", "con paréntesis y punto"],
    ["  9 1234 5678  ", "con espacios alrededor"],
  ])("acepta %s (%s)", (entrada) => {
    expect(normalizarTelefono(entrada)).toBe(CANONICO);
  });

  it.each([
    ["2 2123 4567", "fijo de Santiago"],
    ["+56 2 2123 4567", "fijo con código de país"],
    ["1234 5678", "ocho dígitos, formato antiguo"],
    ["9 1234 567", "le falta un dígito"],
    ["9 1234 56789", "le sobra un dígito"],
    ["+54 9 11 1234 5678", "móvil argentino"],
    ["0056912345678", "prefijo internacional 00"],
    ["9 1234 abcd", "con letras"],
    ["", "vacío"],
  ])("rechaza %s (%s)", (entrada) => {
    expect(normalizarTelefono(entrada)).toBeNull();
  });
});

describe("formatearTelefono", () => {
  it("agrupa un número canónico para mostrarlo", () => {
    expect(formatearTelefono(CANONICO)).toBe("+56 9 1234 5678");
  });

  it("devuelve tal cual lo que no reconoce", () => {
    expect(formatearTelefono("algo raro")).toBe("algo raro");
  });
});
