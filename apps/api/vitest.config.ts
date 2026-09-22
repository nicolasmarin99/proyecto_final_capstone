import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 20000,
    // Todos los archivos comparten la misma base localcl_test y cada uno
    // vacía las tablas en su beforeEach. En paralelo se pisarían entre sí,
    // así que se ejecutan de a uno.
    fileParallelism: false,
  },
});
