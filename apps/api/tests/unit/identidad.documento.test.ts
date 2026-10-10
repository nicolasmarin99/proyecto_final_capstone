import { describe, expect, it } from "vitest";
import { detectarTipo, quitarMetadatos } from "../../src/modules/identidad/identidad.documento.js";
import { jpgConExif, pdfMinimo, pngConTexto } from "../archivos.js";

describe("detectarTipo: por los bytes, no por el nombre", () => {
  it("reconoce JPG, PNG y PDF", () => {
    expect(detectarTipo(jpgConExif())).toBe("jpg");
    expect(detectarTipo(pngConTexto())).toBe("png");
    expect(detectarTipo(pdfMinimo())).toBe("pdf");
  });

  it.each([
    ["un GIF", Buffer.from("GIF89a\x01\x00\x01\x00", "latin1")],
    ["un ejecutable de Windows", Buffer.from("MZ\x90\x00\x03\x00", "latin1")],
    ["texto plano", Buffer.from("hola, soy un .jpg de mentira")],
    ["un HTML", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["un archivo vacío", Buffer.alloc(0)],
  ])("rechaza %s", (_nombre, bytes) => {
    expect(detectarTipo(bytes)).toBeNull();
  });
});

describe("quitarMetadatos", () => {
  it("borra el EXIF de un JPG (cámara y GPS) y conserva la imagen", () => {
    const original = jpgConExif();
    const limpio = quitarMetadatos(original, "jpg");

    expect(original.includes("GPS-SECRETO")).toBe(true);
    expect(limpio.includes("GPS-SECRETO")).toBe(false);
    expect(limpio.includes("Exif")).toBe(false);
    // Sigue siendo un JPG y conserva los datos de la imagen.
    expect(detectarTipo(limpio)).toBe("jpg");
    expect(limpio.includes("DATOS-DE-IMAGEN")).toBe(true);
  });

  it("borra los fragmentos de texto y de fecha de un PNG", () => {
    const original = pngConTexto();
    const limpio = quitarMetadatos(original, "png");

    expect(original.includes("Autor: Persona Real")).toBe(true);
    expect(limpio.includes("Autor: Persona Real")).toBe(false);
    expect(limpio.includes("tIME")).toBe(false);
    expect(detectarTipo(limpio)).toBe("png");
    expect(limpio.includes("IHDR")).toBe(true);
    expect(limpio.includes("IEND")).toBe(true);
  });

  it("deja un PDF tal cual (no tiene EXIF)", () => {
    const pdf = pdfMinimo();

    expect(quitarMetadatos(pdf, "pdf").equals(pdf)).toBe(true);
  });

  it("rechaza un JPG truncado en vez de guardarlo a medias", () => {
    const truncado = jpgConExif().subarray(0, 12);

    expect(() => quitarMetadatos(truncado, "jpg")).toThrow();
  });
});
