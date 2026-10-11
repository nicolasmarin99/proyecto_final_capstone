import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaId, esquemaServicio } from "./servicios.schema.js";
import { categorias, crear, editar, eliminar, mios, publico } from "./servicios.service.js";

/**
 * Sin try/catch: Express 5 entrega los rechazos al manejador central.
 * El dueño sale siempre del token, nunca del cuerpo ni de la URL.
 */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function crearServicio(req: Request, res: Response) {
  const datos = esquemaServicio.parse(req.body);

  res.status(201).json(await crear(idDelUsuario(req), datos));
}

export async function editarServicio(req: Request, res: Response) {
  const { id } = esquemaId.parse(req.params);
  const datos = esquemaServicio.parse(req.body);

  res.status(200).json(await editar(idDelUsuario(req), id, datos));
}

export async function eliminarServicio(req: Request, res: Response) {
  const { id } = esquemaId.parse(req.params);
  await eliminar(idDelUsuario(req), id);

  res.status(204).end();
}

export async function misServicios(req: Request, res: Response) {
  res.status(200).json(await mios(idDelUsuario(req)));
}

export async function servicioPublico(req: Request, res: Response) {
  const { id } = esquemaId.parse(req.params);

  res.status(200).json({ servicio: await publico(id) });
}

export async function listarCategorias(_req: Request, res: Response) {
  // Cambian solo cuando un administrador las edita: una hora de caché basta.
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).json({ categorias: await categorias() });
}
