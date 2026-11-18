import { describe, expect, it } from "vitest";
import { esFechaCalendario, fechaDeHoyEnChile } from "./contrataciones.js";

describe("fechaDeHoyEnChile", () => {
  it("cuenta el día en Santiago, no en UTC", () => {
    // 02:00 UTC del 19 de noviembre son las 23:00 del 18 en Chile (UTC-3).
    expect(fechaDeHoyEnChile(new Date("2026-11-19T02:00:00Z"))).toBe("2026-11-18");
    expect(fechaDeHoyEnChile(new Date("2026-11-19T04:00:00Z"))).toBe("2026-11-19");
  });
});

describe("esFechaCalendario", () => {
  it("acepta AAAA-MM-DD de fechas que existen", () => {
    expect(esFechaCalendario("2026-11-18")).toBe(true);
    expect(esFechaCalendario("2024-02-29")).toBe(true);
  });

  it("rechaza fechas que no existen u otros formatos", () => {
    expect(esFechaCalendario("2026-02-30")).toBe(false);
    expect(esFechaCalendario("2025-02-29")).toBe(false);
    expect(esFechaCalendario("18-11-2026")).toBe(false);
    expect(esFechaCalendario("2026-11-18T00:00:00Z")).toBe(false);
    expect(esFechaCalendario("")).toBe(false);
  });
});
