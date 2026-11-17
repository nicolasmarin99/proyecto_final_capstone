/*
  Lee los documentos que quedaron pendientes de lectura automática.

    npm run extracciones:procesar --workspace=@localcl/api

  Al subir un documento, la lectura corre en segundo plano. Si falló, tardó
  demasiado o la API se reinició a mitad de camino, la extracción queda
  PENDIENTE o FALLIDA: este script la retoma. Corre cada noche desde GitHub
  Actions (.github/workflows/extracciones.yml) y se puede correr a mano.

  - En lotes, de los documentos más antiguos a los más nuevos.
  - Idempotente: un documento ya leído no se vuelve a leer, y uno que falla
    se intenta a lo más 3 veces en total. Si todo está al día, no llama al
    lector ni una vez.
  - NO aprueba nada: solo precarga campos para el administrador.

  Usa la base de DATABASE_URL, el almacenamiento de ALMACENAMIENTO_TRANSPORTE
  y el lector de LECTURA_PROVEEDOR del entorno donde se ejecuta.
*/
import { prisma } from "../db.js";
import { env } from "../env.js";
import { leerPendientes } from "../modules/lectura-documentos/lectura.service.js";

async function main() {
  if (env.LECTURA_PROVEEDOR === "ninguno") {
    console.log("LECTURA_PROVEEDOR=ninguno: la lectura automática está apagada. No hay nada que procesar.");
    return;
  }

  console.log(`Lector de documentos: ${env.LECTURA_PROVEEDOR} (${env.LECTURA_PROVEEDOR === "gemini" ? env.LECTURA_MODELO : "sin red"})`);
  const resultado = await leerPendientes();
  // Solo conteos: ni ids de personas ni nada leído de un documento.
  console.log(
    `${resultado.porLeer} documentos por leer: ${resultado.extraidas} leídos, ${resultado.fallidas} fallidos, ${resultado.omitidas} omitidos.`,
  );
  // Si algo falló, el código de salida lo dice: la corrida aparece en rojo y se puede repetir.
  if (resultado.fallidas > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("No se pudo procesar las extracciones:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
