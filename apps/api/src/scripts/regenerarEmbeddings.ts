/*
  Regenera los embeddings que faltan o están desactualizados.

    npm run embeddings:regenerar --workspace=@localcl/api

  - Faltan: servicios sin vector (creados antes de esta función, o cuyo
    vector no se pudo calcular porque el proveedor falló al publicar).
  - Desactualizados: el texto (título, descripción o categoría) o el
    proveedor/modelo ya no coinciden con el hash guardado.

  Procesa en lotes (una llamada al proveedor por lote) y es idempotente: se
  puede correr las veces que sea; si todo está al día, no llama a nadie.

  Usa la base de DATABASE_URL y el proveedor de EMBEDDINGS_PROVEEDOR del
  entorno donde se ejecuta.
*/
import { prisma } from "../db.js";
import { env } from "../env.js";
import { regenerarEmbeddings } from "../modules/servicios/servicios.indexacion.js";

async function main() {
  console.log(`Proveedor de embeddings: ${env.EMBEDDINGS_PROVEEDOR} (${env.EMBEDDINGS_MODELO}, ${env.EMBEDDINGS_DIMENSIONES} dimensiones)`);
  const resultado = await regenerarEmbeddings();
  console.log(
    `${resultado.revisados} servicios revisados: ${resultado.pendientes} pendientes, ` +
      `${resultado.vectorizados} vectorizados, ${resultado.fallidos} fallidos, ${resultado.llamadas} llamadas al proveedor.`,
  );
  // Si algo falló, el código de salida lo dice: se puede volver a correr.
  if (resultado.fallidos > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("No se pudo regenerar los embeddings:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
