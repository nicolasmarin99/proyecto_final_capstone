import { describe, expect, it } from "vitest";
import { EmbeddingsDeterministas } from "../../src/modules/embeddings/embeddings.deterministas.js";

function coseno(a: number[], b: number[]): number {
  return a.reduce((suma, valor, indice) => suma + valor * (b[indice] ?? 0), 0);
}

describe("EmbeddingsDeterministas", () => {
  const proveedor = new EmbeddingsDeterministas(768);

  it("el mismo texto da siempre el mismo vector, de 768 números y largo 1", async () => {
    const [primero] = await proveedor.vectorizar(["Destape de cañerías"]);
    const [segundo] = await new EmbeddingsDeterministas(768).vectorizar(["Destape de cañerías"]);

    expect(primero).toEqual(segundo);
    expect(primero).toHaveLength(768);
    expect(Math.sqrt(coseno(primero ?? [], primero ?? []))).toBeCloseTo(1, 10);
  });

  it("textos que comparten conceptos quedan cerca aunque no compartan palabras", async () => {
    const [consulta, destape, enchufes] = await proveedor.vectorizar([
      "se me tapó el baño",
      "Destape de alcantarillado\nCañerías y cámaras\nCategoría: Gasfitería",
      "Instalación de enchufes\nLuminarias y focos\nCategoría: Electricidad",
    ]);

    expect(coseno(consulta ?? [], destape ?? [])).toBeGreaterThan(0.5);
    expect(Math.abs(coseno(consulta ?? [], enchufes ?? []))).toBeLessThan(0.2);
  });

  it("un texto sin nada en común queda casi perpendicular (por eso el umbral funciona)", async () => {
    const [piano, destape] = await proveedor.vectorizar(["clases de piano para niños", "Destape de alcantarillado"]);

    expect(Math.abs(coseno(piano ?? [], destape ?? []))).toBeLessThan(0.2);
  });

  it("un texto sin palabras útiles igual recibe un vector (nunca el vector cero)", async () => {
    const [vector] = await proveedor.vectorizar(["de la"]);

    expect(Math.sqrt(coseno(vector ?? [], vector ?? []))).toBeCloseTo(1, 10);
  });
});
