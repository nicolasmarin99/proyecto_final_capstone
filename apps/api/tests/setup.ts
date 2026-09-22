import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Se carga antes que src/env.ts para que .env.test gane sobre .env.
// La ruta se resuelve respecto de este archivo y no del directorio actual,
// para que no dependa de desde dónde se invoque Vitest.
const rutaEnvTest = fileURLToPath(new URL("../.env.test", import.meta.url));
config({ path: rutaEnvTest, override: true, quiet: true });

// Guardarraíl: las pruebas borran filas de la base. Si por un .env.test
// ausente o mal configurado apuntaran a la base de desarrollo, se detienen
// antes de tocar nada. En CI la base es un contenedor desechable, así que
// allí la comprobación no aplica.
const urlBaseDatos = process.env.DATABASE_URL ?? "";

if (!process.env.CI && !urlBaseDatos.includes("localcl_test")) {
  throw new Error(
    "Las pruebas deben apuntar a localcl_test. Copia apps/api/.env.test.example a apps/api/.env.test.",
  );
}
