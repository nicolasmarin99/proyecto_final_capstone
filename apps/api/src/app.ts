import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./env.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ estado: "ok", entorno: env.NODE_ENV, hora: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Recurso no encontrado" } });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado" } });
});