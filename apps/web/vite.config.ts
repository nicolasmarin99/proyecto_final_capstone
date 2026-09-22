import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // La web llama siempre a /api/..., nunca al host de la API. Así el
    // navegador ve un solo origen y la cookie de refresco es de primera
    // parte: sin esto, SameSite=Strict impediría que se enviara.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (ruta) => ruta.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
