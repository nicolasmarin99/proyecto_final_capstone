import type { Request, Response } from "express";
import { esquemaPendientes } from "./admin.schema.js";
import { obtenerPendientes, obtenerResumen } from "./admin.service.js";

/**
 * Sin try/catch: Express 5 entrega el rechazo al manejador central de app.ts.
 * Tampoco comprueba permisos: de eso ya se ocupó autorizar() en las rutas.
 */
export async function resumen(_req: Request, res: Response) {
  res.status(200).json({ resumen: await obtenerResumen() });
}

export async function pendientes(req: Request, res: Response) {
  const { pagina, porPagina } = esquemaPendientes.parse(req.query);

  // Nombres de personas y lo que tienen en revisión: que nadie lo guarde.
  res.set("Cache-Control", "no-store");
  res.status(200).json(await obtenerPendientes(pagina, porPagina));
}
