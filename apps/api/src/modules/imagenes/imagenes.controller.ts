import type { NextFunction, Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { exigirDueno } from "../servicios/servicios.service.js";
import { esquemaIdImagen, esquemaIdServicio, esquemaIdsImagen, esquemaListadoAdmin, esquemaOcultar, esquemaOrden } from "./imagenes.schema.js";
import { eliminarImagen, listarParaModerar, ocultar, ordenarImagenes, subirImagen } from "./imagenes.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

/**
 * Middleware: corta con 404 o 403 antes de leer el archivo. Así un
 * prestador no puede hacer que el servidor reciba 5 MB para un servicio que
 * no es suyo.
 */
export async function soloDuenoDelServicio(req: Request, _res: Response, next: NextFunction) {
  const { id } = esquemaIdServicio.parse(req.params);
  await exigirDueno(idDelUsuario(req), id);
  next();
}

export async function subir(req: Request, res: Response) {
  const { id } = esquemaIdServicio.parse(req.params);

  // De req.file solo se usa el contenido: ni originalname ni mimetype, que los escribe el cliente.
  if (!req.file) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "imagen", mensaje: "Adjunta la imagen en el campo «imagen»." },
    ]);
  }

  res.status(201).json({ imagen: await subirImagen(idDelUsuario(req), id, req.file.buffer) });
}

export async function eliminar(req: Request, res: Response) {
  const { id, imagenId } = esquemaIdsImagen.parse(req.params);
  await eliminarImagen(idDelUsuario(req), id, imagenId);

  res.status(204).end();
}

export async function ordenar(req: Request, res: Response) {
  const { id } = esquemaIdServicio.parse(req.params);
  const { imagenes } = esquemaOrden.parse(req.body);

  res.status(200).json({ imagenes: await ordenarImagenes(idDelUsuario(req), id, imagenes) });
}

export async function listarAdmin(req: Request, res: Response) {
  res.status(200).json(await listarParaModerar(esquemaListadoAdmin.parse(req.query)));
}

export async function ocultarAdmin(req: Request, res: Response) {
  const { id } = esquemaIdImagen.parse(req.params);
  const { motivo } = esquemaOcultar.parse(req.body);

  res.status(200).json({ imagen: await ocultar(id, idDelUsuario(req), motivo) });
}
