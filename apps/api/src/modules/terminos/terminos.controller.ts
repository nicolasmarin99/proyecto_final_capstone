import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaAceptarTerminos } from "./terminos.schema.js";
import { aceptar, vigente } from "./terminos.service.js";

export async function obtenerVigente(_req: Request, res: Response) {
  res.status(200).json({ terminos: await vigente() });
}

export async function aceptarVigente(req: Request, res: Response) {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  const { versionTerminos } = esquemaAceptarTerminos.parse(req.body);

  res.status(200).json(await aceptar(req.usuario.id, versionTerminos));
}
