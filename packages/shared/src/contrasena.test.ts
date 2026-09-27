import { describe, expect, it } from "vitest";
import {
  LARGO_MAXIMO_CONTRASENA,
  LARGO_MINIMO_CONTRASENA,
  mensajeDeProblema,
  revisarContrasena,
} from "./contrasena.js";

const datos = { correo: "ana.perez@ejemplo.cl", nombre: "Ana Pérez" };

describe("revisarContrasena", () => {
  it("acepta una contraseña larga sin datos personales", () => {
    expect(revisarContrasena("caballo-bateria-grapa", datos)).toBeNull();
  });

  it("no exige mayúsculas, números ni símbolos", () => {
    // Una frase en minúsculas es más fuerte que "Clave123!" y no debe rechazarse.
    expect(revisarContrasena("tres tristes tigres comian", datos)).toBeNull();
  });

  it("rechaza por debajo del mínimo", () => {
    expect(revisarContrasena("a".repeat(LARGO_MINIMO_CONTRASENA - 1))).toBe("MUY_CORTA");
    expect(revisarContrasena("a".repeat(LARGO_MINIMO_CONTRASENA))).toBeNull();
  });

  it("rechaza por encima del máximo", () => {
    expect(revisarContrasena("a".repeat(LARGO_MAXIMO_CONTRASENA))).toBeNull();
    expect(revisarContrasena("a".repeat(LARGO_MAXIMO_CONTRASENA + 1))).toBe("MUY_LARGA");
  });

  it("rechaza la que contiene el correo completo", () => {
    expect(revisarContrasena("xx-ana.perez@ejemplo.cl-xx", datos)).toBe("CONTIENE_CORREO");
  });

  it("rechaza la que contiene solo la parte local del correo", () => {
    expect(revisarContrasena("ana.perez-2026-clave", datos)).toBe("CONTIENE_CORREO");
  });

  it("no se deja engañar por mayúsculas", () => {
    expect(revisarContrasena("ANA.PEREZ-2026-clave", datos)).toBe("CONTIENE_CORREO");
  });

  it("rechaza la que contiene el apellido, con o sin tilde", () => {
    expect(revisarContrasena("mi-clave-perez-2026", datos)).toBe("CONTIENE_NOMBRE");
    expect(revisarContrasena("mi-clave-Pérez-2026", datos)).toBe("CONTIENE_NOMBRE");
  });

  it("rechaza el nombre completo sin espacios", () => {
    expect(revisarContrasena("anaperez-clave-larga", datos)).toBe("CONTIENE_NOMBRE");
  });

  it("no rechaza por fragmentos demasiado cortos del nombre", () => {
    // "Ana" tiene tres letras: prohibirla dejaría fuera palabras como "banana".
    expect(revisarContrasena("banana-con-manzana", { nombre: "Ana Pérez" })).toBeNull();
  });

  it("no compara contra datos que no le pasaron", () => {
    expect(revisarContrasena("ana.perez-2026-clave")).toBeNull();
  });

  it("el largo se revisa antes que el contenido", () => {
    // Sin este orden, una contraseña corta que además lleva el correo
    // reportaría el problema menos útil de los dos.
    expect(revisarContrasena("ana.perez", datos)).toBe("MUY_CORTA");
  });

  it("todos los problemas tienen mensaje en español", () => {
    const problemas = ["MUY_CORTA", "MUY_LARGA", "CONTIENE_CORREO", "CONTIENE_NOMBRE"] as const;

    for (const problema of problemas) {
      expect(mensajeDeProblema(problema).length).toBeGreaterThan(10);
    }
  });
});
