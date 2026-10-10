import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { TAMANO_MAXIMO_DOCUMENTO } from "@localcl/shared";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { rutasAdmin } from "./modules/admin/admin.routes.js";
import { rutasAuth } from "./modules/auth/auth.routes.js";
import { rutasIdentidadAdmin, rutasIdentidadPrestador } from "./modules/identidad/identidad.routes.js";
import { rutasPrestadores } from "./modules/prestadores/prestadores.routes.js";
import { rutasServicios } from "./modules/servicios/servicios.routes.js";
import { rutasComunas } from "./modules/territorio/territorio.routes.js";
import { ErrorHttp } from "./shared/errores.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ estado: "ok", baseDatos: "ok", entorno: env.NODE_ENV });
  } catch {
    res.status(503).json({ estado: "degradado", baseDatos: "sin conexión" });
  }
});

app.use("/auth", rutasAuth);
// Antes que /admin y /prestadores: las rutas más específicas primero.
app.use("/admin/identidades", rutasIdentidadAdmin);
app.use("/prestadores/yo/identidad", rutasIdentidadPrestador);
app.use("/admin", rutasAdmin);
app.use("/servicios", rutasServicios);
app.use("/prestadores", rutasPrestadores);
app.use("/comunas", rutasComunas);

app.use((_req, res) => {
  res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Recurso no encontrado" } });
});

/** express.json() lanza un SyntaxError con este "type" cuando el cuerpo no parsea. */
function esJsonMalFormado(error: unknown): boolean {
  return error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed";
}

// Manejador central de errores. Es el único lugar que decide el estado HTTP,
// así ninguna capa inferior necesita conocer Express.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        codigo: "DATOS_INVALIDOS",
        mensaje: "Los datos enviados no son válidos.",
        detalles: err.issues.map((incidencia) => ({
          campo: incidencia.path.map(String).join("."),
          mensaje: incidencia.message,
        })),
      },
    });
    return;
  }

  // Errores de la carga de archivos: tamaño, cantidad o campo equivocado.
  // Se responden con la misma forma que un error de Zod, colgados del campo
  // "documento", para que la web los muestre bajo el selector de archivo.
  if (err instanceof multer.MulterError) {
    const mensajes: Partial<Record<multer.ErrorCode, string>> = {
      LIMIT_FILE_SIZE: `El archivo supera los ${TAMANO_MAXIMO_DOCUMENTO / (1024 * 1024)} MB.`,
      LIMIT_FILE_COUNT: "Adjunta un solo archivo.",
      LIMIT_UNEXPECTED_FILE: "Adjunta tu documento en el campo «documento».",
    };

    res.status(400).json({
      error: {
        codigo: "DATOS_INVALIDOS",
        mensaje: "Los datos enviados no son válidos.",
        detalles: [{ campo: "documento", mensaje: mensajes[err.code] ?? "No se pudo recibir el archivo." }],
      },
    });
    return;
  }

  if (esJsonMalFormado(err)) {
    res.status(400).json({
      error: { codigo: "JSON_INVALIDO", mensaje: "El cuerpo de la petición no es JSON válido." },
    });
    return;
  }

  if (err instanceof ErrorHttp) {
    res.status(err.estado).json({
      error: {
        codigo: err.codigo,
        mensaje: err.message,
        // Solo se incluye cuando hay algo que decir de un campo concreto, para
        // que las respuestas sin detalle no cambien de forma.
        ...(err.detalles.length > 0 ? { detalles: err.detalles } : {}),
      },
    });
    return;
  }

  // Cualquier otro fallo es imprevisto: se registra completo en el servidor y
  // el cliente recibe solo un mensaje genérico, sin trazas internas.
  console.error(err);
  res
    .status(500)
    .json({ error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado." } });
});