import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { esquemaCertificacion, esquemaColaCertificaciones, esquemaIdCertificacion, esquemaRechazoCertificacion } from "./certificaciones.schema.js";
import { aprobar, catalogo, cola, enviar, propias, rechazar, urlDocumento } from "./certificaciones.service.js";

/** Sin try/catch: Express 5 entrega los rechazos al manejador central. El usuario sale del token. */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }
  return req.usuario.id;
}

export async function listarTipos(_req: Request, res: Response) {
  // Cambia solo cuando se carga el catálogo: una hora de caché basta.
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).json({ tipos: await catalogo() });
}

export async function subir(req: Request, res: Response) {
  // Los campos van en el cuerpo multipart; del archivo solo se usa el
  // contenido: ni originalname ni mimetype, que los escribe el cliente.
  const datos = esquemaCertificacion.parse(req.body);
  if (!req.file) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "documento", mensaje: "Adjunta la foto o el documento que acredita la certificación." },
    ]);
  }

  res.status(201).json({ certificacion: await enviar(idDelUsuario(req), datos, req.file.buffer) });
}

export async function listarPropias(req: Request, res: Response) {
  res.status(200).json({ certificaciones: await propias(idDelUsuario(req)) });
}

export async function listarCola(req: Request, res: Response) {
  const { estado, pagina, porPagina } = esquemaColaCertificaciones.parse(req.query);

  res.status(200).json(await cola(estado, pagina, porPagina));
}

export async function documento(req: Request, res: Response) {
  const { id } = esquemaIdCertificacion.parse(req.params);
  const resultado = await urlDocumento(id, idDelUsuario(req));

  // Lleva una URL que, mientras no vence, abre el documento: que nadie la guarde.
  res.set("Cache-Control", "no-store");
  res.status(200).json(resultado);
}

export async function aprobarCertificacion(req: Request, res: Response) {
  const { id } = esquemaIdCertificacion.parse(req.params);

  res.status(200).json({ certificacion: await aprobar(id, idDelUsuario(req)) });
}

export async function rechazarCertificacion(req: Request, res: Response) {
  const { id } = esquemaIdCertificacion.parse(req.params);
  const { motivo } = esquemaRechazoCertificacion.parse(req.body);

  res.status(200).json({ certificacion: await rechazar(id, idDelUsuario(req), motivo) });
}
