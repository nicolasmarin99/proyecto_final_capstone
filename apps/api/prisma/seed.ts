import { hash } from "@node-rs/argon2";
import { prisma } from "../src/db.js";

async function main() {
  const usuarios = [
    { correo: "admin@localcl.cl", nombre: "Administrador", rol: "ADMINISTRADOR" as const },
    { correo: "prestador@localcl.cl", nombre: "Prestador de prueba", rol: "PRESTADOR" as const },
    { correo: "cliente@localcl.cl", nombre: "Cliente de prueba", rol: "CLIENTE" as const },
  ];

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { correo: u.correo },
      update: {},
      create: { ...u, correoVerificado: true, hashContrasena: await hash("Local.2026!") },
    });
  }

  console.log(`${usuarios.length} usuarios de prueba listos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());