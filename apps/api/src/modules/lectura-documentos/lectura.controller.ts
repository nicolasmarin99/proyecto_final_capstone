import type { Request, Response } from "express";
import { esquemaIdCredencial } from "./lectura.schema.js";
import { extraccionParaRevisar } from "./lectura.service.js";

/**
 * Sin try/catch: Express 5 entrega los rechazos al manejador central. Los
 * permisos ya los revisaron los middlewares de las rutas.
 */
export async function verExtraccion(req: Request, res: Response) {
  const { credencialId } = esquemaIdCredencial.parse(req.params);

  // Lleva el nombre y el RUT leídos de un documento: que nadie lo guarde.
  res.set("Cache-Control", "no-store");
  res.status(200).json(await extraccionParaRevisar(credencialId));
}
