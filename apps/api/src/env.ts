import "dotenv/config";
import { z } from "zod";

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Sin valor por defecto a propósito: un secreto de firma con valor
  // predecible haría falsificables todos los tokens. Si falta, la API no
  // arranca. El mínimo de 32 caracteres evita claves triviales para HS256.
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres."),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error("Configuración inválida:");
  for (const issue of resultado.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = resultado.data;