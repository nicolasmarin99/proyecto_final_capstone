import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaIdPrestador, esquemaIdValoracion, esquemaObjecion, esquemaPaginaValoraciones, esquemaValoracion } from "./valoraciones.schema.js";
import { mia, objetar, publicas, recibidas, valorar } from "./valoraciones.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function crear(req: Request, res: Response) {
  const { id } = esquemaIdPrestador.parse(req.params);
  const datos = esquemaValoracion.parse(req.body);
  const valoracion = await valorar(idDelUsuario(req), id, datos);

  res.status(201).json({ valoracion });
}

export async function obtenerPropia(req: Request, res: Response) {
  const { id } = esquemaIdPrestador.parse(req.params);

  res.set("Cache-Control", "no-store");
  res.status(200).json(await mia(idDelUsuario(req), id));
}

export async function listarPublicas(req: Request, res: Response) {
  const { id } = esquemaIdPrestador.parse(req.params);
  const { pagina, porPagina } = esquemaPaginaValoraciones.parse(req.query);

  res.status(200).json(await publicas(id, pagina, porPagina));
}

export async function listarRecibidas(req: Request, res: Response) {
  const { pagina, porPagina } = esquemaPaginaValoraciones.parse(req.query);

  res.set("Cache-Control", "no-store");
  res.status(200).json(await recibidas(idDelUsuario(req), pagina, porPagina));
}

export async function crearObjecion(req: Request, res: Response) {
  const { id } = esquemaIdValoracion.parse(req.params);
  const datos = esquemaObjecion.parse(req.body);

  res.status(201).json(await objetar(idDelUsuario(req), id, datos));
}
