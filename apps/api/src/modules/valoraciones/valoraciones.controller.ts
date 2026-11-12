import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaIdPrestador, esquemaIdValoracion, esquemaObjecion, esquemaPaginaValoraciones, esquemaValoracion } from "./valoraciones.schema.js";
import { mia, objetar, publicas, recibidas, retirar, valorar } from "./valoraciones.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function crearOEditar(req: Request, res: Response) {
  const { id } = esquemaIdPrestador.parse(req.params);
  const datos = esquemaValoracion.parse(req.body);
  const { creada, valoracion } = await valorar(idDelUsuario(req), id, datos);

  // 201 la primera vez, 200 al editar.
  res.status(creada ? 201 : 200).json({ valoracion });
}

export async function retirarPropia(req: Request, res: Response) {
  const { id } = esquemaIdPrestador.parse(req.params);
  await retirar(idDelUsuario(req), id);

  res.status(204).end();
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
