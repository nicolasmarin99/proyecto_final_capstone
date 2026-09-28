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

  // Base pública de la web. Se usa para armar los enlaces que viajan por
  // correo, así que no puede salir de la petición: un atacante podría enviar
  // una cabecera Host falsa y conseguir que el enlace de recuperación apunte
  // a su propio dominio.
  URL_WEB: z.string().default("http://localhost:5173"),

  // "memoria" no envía nada y guarda lo enviado en una lista: es lo que usan
  // las pruebas. "smtp" apunta al Mailpit de docker-compose. El proveedor de
  // producción todavía no existe, y por eso no es un valor aceptado.
  CORREO_TRANSPORTE: z.enum(["smtp", "memoria"]).default("smtp"),
  CORREO_SMTP_HOST: z.string().default("localhost"),
  CORREO_SMTP_PUERTO: z.coerce.number().default(1025),
  CORREO_REMITENTE: z.string().default("LocalCL <no-responder@localcl.cl>"),

  // Consulta a Have I Been Pwned al elegir contraseña. Se apaga en las pruebas
  // de integración para que no dependan de la red: el comportamiento del
  // módulo se prueba aparte, con fetch simulado.
  REVISAR_CONTRASENAS_FILTRADAS: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
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