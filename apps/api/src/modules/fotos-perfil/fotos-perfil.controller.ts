import type { Request, Response } from "express";
import { esquemaDecision } from "../reportes/reportes.schema.js";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaIdFoto, esquemaListadoFotos, esquemaReporteFoto } from "./fotos-perfil.schema.js";
import { decidirFoto, listarReportadas, miFoto, quitarFoto, reportarFoto, subirFoto } from "./fotos-perfil.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function obtenerMia(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.status(200).json(await miFoto(idDelUsuario(req)));
}

export async function subir(req: Request, res: Response) {
  // De req.file solo se usa el contenido: ni originalname ni mimetype, que los escribe el cliente.
  if (!req.file) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "imagen", mensaje: "Adjunta la foto en el campo «imagen»." },
    ]);
  }

  res.status(201).json({ foto: await subirFoto(idDelUsuario(req), req.file.buffer) });
}

export async function quitar(req: Request, res: Response) {
  await quitarFoto(idDelUsuario(req));

  res.status(204).end();
}

export async function reportar(req: Request, res: Response) {
  const { id } = esquemaIdFoto.parse(req.params);
  const datos = esquemaReporteFoto.parse(req.body);

  // 202 siempre, se haya creado o ya existiera: la respuesta no revela nada.
  res.status(202).json(await reportarFoto(idDelUsuario(req), id, datos));
}

export async function listarAdmin(req: Request, res: Response) {
  res.status(200).json(await listarReportadas(esquemaListadoFotos.parse(req.query)));
}

export async function retirarAdmin(req: Request, res: Response) {
  const { id } = esquemaIdFoto.parse(req.params);
  const { motivo } = esquemaDecision.parse(req.body);

  res.status(200).json(await decidirFoto(id, idDelUsuario(req), "RETIRAR_FOTO_PERFIL", motivo));
}

export async function desestimarAdmin(req: Request, res: Response) {
  const { id } = esquemaIdFoto.parse(req.params);
  const { motivo } = esquemaDecision.parse(req.body);

  res.status(200).json(await decidirFoto(id, idDelUsuario(req), "DESESTIMAR", motivo));
}
