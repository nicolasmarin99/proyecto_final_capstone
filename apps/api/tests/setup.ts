import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Se carga antes que src/env.ts para que .env.test gane sobre .env.
// La ruta se resuelve respecto de este archivo y no del directorio actual,
// para que no dependa de desde dónde se invoque Vitest.
const rutaEnvTest = fileURLToPath(new URL("../.env.test", import.meta.url));
config({ path: rutaEnvTest, override: true, quiet: true });

// Las imágenes públicas de las pruebas viven en memoria: nunca en el disco
// ni en Cloudinary, sin importar qué diga .env.test.
process.env.ALMACENAMIENTO_PUBLICO_TRANSPORTE = "memoria";

// Ninguna prueba llama a la API de Google: los embeddings salen del
// proveedor determinista (un hash del texto, sin red), diga lo que diga
// .env.test, y sin clave. Las pruebas del adaptador de Gemini simulan fetch.
process.env.EMBEDDINGS_PROVEEDOR = "determinista";
process.env.GEMINI_API_KEY = "";

// Segunda barrera: si algo intentara salir igual hacia Google, falla en el
// acto en vez de gastar cuota o depender de la red.
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (entrada, opciones) => {
  const url = entrada instanceof Request ? entrada.url : String(entrada);
  if (url.includes("googleapis.com")) {
    return Promise.reject(new Error(`Una prueba intentó llamar a Google (${new URL(url).host}).`));
  }
  return fetchOriginal(entrada, opciones);
};

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
