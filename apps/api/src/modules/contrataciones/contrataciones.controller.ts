import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import {
  esquemaCrearContratacion,
  esquemaEditarContratacion,
  esquemaIdContratacion,
  esquemaIdServicio,
  esquemaPaginaContrataciones,
} from "./contrataciones.schema.js";
import { editar, eliminar, estadoEnServicio, mias, registrar } from "./contrataciones.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

// Datos privados: ningún intermediario los guarda.
function sinCache(res: Response) {
  res.set("Cache-Control", "no-store");
}

export async function listar(req: Request, res: Response) {
  const { pagina, porPagina } = esquemaPaginaContrataciones.parse(req.query);
  sinCache(res);
  res.status(200).json(await mias(idDelUsuario(req), pagina, porPagina));
}

export async function crear(req: Request, res: Response) {
  const datos = esquemaCrearContratacion.parse(req.body);
  sinCache(res);
  res.status(201).json({ contratacion: await registrar(idDelUsuario(req), datos) });
}

export async function actualizar(req: Request, res: Response) {
  const { id } = esquemaIdContratacion.parse(req.params);
  const datos = esquemaEditarContratacion.parse(req.body);
  sinCache(res);
  res.status(200).json({ contratacion: await editar(idDelUsuario(req), id, datos) });
}

export async function borrar(req: Request, res: Response) {
  const { id } = esquemaIdContratacion.parse(req.params);
  await eliminar(idDelUsuario(req), id);
  res.status(204).end();
}

export async function enServicio(req: Request, res: Response) {
  const { servicioId } = esquemaIdServicio.parse(req.params);
  sinCache(res);
  res.status(200).json(await estadoEnServicio(idDelUsuario(req), servicioId));
}
