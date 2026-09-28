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
  // las pruebas. "smtp" apunta al Mailpit de docker-compose. "produccion"
  // entrega de verdad, por la API HTTP del proveedor.
  CORREO_TRANSPORTE: z.enum(["smtp", "memoria", "produccion"]).default("smtp"),
  CORREO_SMTP_HOST: z.string().default("localhost"),
  CORREO_SMTP_PUERTO: z.coerce.number().default(1025),

  // Con transporte "produccion" tiene que ser EXACTAMENTE la dirección que
  // verificaste en el panel del proveedor, o el envío se rechaza.
  CORREO_REMITENTE: z.string().default("LocalCL <no-responder@localcl.cl>"),

  // Clave de la API del proveedor. Vacía por defecto para que desarrollo y
  // pruebas no la necesiten; abajo se exige cuando el transporte es
  // "produccion". Nunca va en el repositorio: se configura en el panel del
  // servicio donde corre la API.
  CORREO_API_CLAVE: z.string().default(""),

  // Consulta a Have I Been Pwned al elegir contraseña. Se apaga en las pruebas
  // de integración para que no dependan de la red: el comportamiento del
  // módulo se prueba aparte, con fetch simulado.
  REVISAR_CONTRASENAS_FILTRADAS: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
})
  // La clave solo es obligatoria cuando se va a usar. Exigirla siempre
  // obligaría a inventar un valor en desarrollo y en CI, y un valor inventado
  // en una variable de credencial es justo lo que después se cuela a
  // producción sin que nadie lo note.
  .superRefine((valores, contexto) => {
    if (valores.CORREO_TRANSPORTE === "produccion" && valores.CORREO_API_CLAVE.length === 0) {
      contexto.addIssue({
        code: "custom",
        path: ["CORREO_API_CLAVE"],
        message:
          "Es obligatoria cuando CORREO_TRANSPORTE=produccion. Sin ella la API arrancaría y " +
          "fallaría recién al intentar enviar el primer correo de recuperación.",
      });
    }
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