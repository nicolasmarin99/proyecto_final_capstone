import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaConsultaCola, esquemaIdIdentidad, esquemaRechazo } from "./identidad.schema.js";
import {
  aprobarIdentidad,
  cargarDocumento,
  obtenerCola,
  obtenerEstadoPropio,
  obtenerUrlDocumento,
  rechazarIdentidad,
} from "./identidad.service.js";

/**
 * Sin try/catch: Express 5 entrega los rechazos al manejador central.
 * Los permisos ya los revisaron los middlewares de las rutas; el id del
 * usuario sale siempre del token.
 */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function subirDocumento(req: Request, res: Response) {
  // multer deja el archivo en memoria (req.file.buffer). Del resto de lo que
  // trae req.file no se usa nada: ni originalname ni mimetype, que los
  // escribe el cliente.
  if (!req.file) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "documento", mensaje: "Adjunta tu documento en el campo «documento»." },
    ]);
  }

  const credencial = await cargarDocumento(idDelUsuario(req), req.file.buffer);

  res.status(201).json({
    identidad: { estado: credencial.estado, motivoRechazo: null, enviadaEn: credencial.creadoEn, revisadaEn: null },
  });
}

export async function estadoPropio(req: Request, res: Response) {
  res.status(200).json(await obtenerEstadoPropio(idDelUsuario(req)));
}

export async function cola(req: Request, res: Response) {
  const { estado, pagina, porPagina } = esquemaConsultaCola.parse(req.query);

  res.status(200).json(await obtenerCola(estado, pagina, porPagina));
}

export async function documento(req: Request, res: Response) {
  const { id } = esquemaIdIdentidad.parse(req.params);
  const resultado = await obtenerUrlDocumento(id, idDelUsuario(req));

  // Ni el navegador ni un proxy intermedio deben guardar la respuesta: lleva
  // una URL que, mientras no vence, abre el documento.
  res.set("Cache-Control", "no-store");
  res.status(200).json(resultado);
}

export async function aprobar(req: Request, res: Response) {
  const { id } = esquemaIdIdentidad.parse(req.params);

  res.status(200).json({ identidad: await aprobarIdentidad(id, idDelUsuario(req)) });
}

export async function rechazar(req: Request, res: Response) {
  const { id } = esquemaIdIdentidad.parse(req.params);
  const { motivo } = esquemaRechazo.parse(req.body);

  res.status(200).json({ identidad: await rechazarIdentidad(id, idDelUsuario(req), motivo) });
}
