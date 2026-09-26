import type { Request, Response } from "express";
import { obtenerResumen } from "./admin.service.js";

/**
 * Sin try/catch: Express 5 entrega el rechazo al manejador central de app.ts.
 * Tampoco comprueba permisos: de eso ya se ocupó autorizar() en las rutas.
 */
export async function resumen(_req: Request, res: Response) {
  res.status(200).json({ resumen: await obtenerResumen() });
}
