// Datos maestros: regiones, comunas de la RM, categorías, tipos de
// credencial y la primera versión de los términos.
//
// A diferencia de seed.ts, este script NO crea usuarios ni datos de prueba,
// así que es seguro correrlo en producción. Es idempotente: se puede volver
// a ejecutar después de cada despliegue sin duplicar nada.
//
//   npm run seed:maestros --workspace=@localcl/api
import { prisma } from "../src/db.js";
import { cargarMaestros } from "../src/maestros/cargarMaestros.js";

async function main() {
  const resumen = await cargarMaestros(prisma);
  console.log("Datos maestros cargados:", resumen);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
