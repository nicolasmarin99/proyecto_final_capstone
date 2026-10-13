import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaCola, esquemaDecision, esquemaIdServicio, esquemaReporte, esquemaServicioAdmin } from "./reportes.schema.js";
import { cola, decidir, detalle, miReporte, reportar, retirar } from "./reportes.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function crear(req: Request, res: Response) {
  const { id } = esquemaIdServicio.parse(req.params);
  const datos = esquemaReporte.parse(req.body);

  // 202 siempre, se haya creado o ya existiera: la respuesta no revela nada.
  res.status(202).json(await reportar(idDelUsuario(req), id, datos));
}

export async function retirarPropio(req: Request, res: Response) {
  const { id } = esquemaIdServicio.parse(req.params);
  await retirar(idDelUsuario(req), id);

  res.status(204).end();
}

export async function obtenerPropio(req: Request, res: Response) {
  const { id } = esquemaIdServicio.parse(req.params);

  res.set("Cache-Control", "no-store");
  res.status(200).json({ reporte: await miReporte(idDelUsuario(req), id) });
}

export async function listarCola(req: Request, res: Response) {
  res.status(200).json(await cola(esquemaCola.parse(req.query)));
}

export async function verDetalle(req: Request, res: Response) {
  const { servicioId } = esquemaServicioAdmin.parse(req.params);

  res.status(200).json(await detalle(servicioId));
}

export async function desestimar(req: Request, res: Response) {
  const { servicioId } = esquemaServicioAdmin.parse(req.params);
  const { motivo } = esquemaDecision.parse(req.body);

  res.status(200).json(await decidir(servicioId, idDelUsuario(req), "DESESTIMAR", motivo));
}

export async function ocultar(req: Request, res: Response) {
  const { servicioId } = esquemaServicioAdmin.parse(req.params);
  const { motivo } = esquemaDecision.parse(req.body);

  res.status(200).json(await decidir(servicioId, idDelUsuario(req), "OCULTAR_SERVICIO", motivo));
}
