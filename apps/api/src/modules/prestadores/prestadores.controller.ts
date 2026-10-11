import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import {
  esquemaComunasAtencion,
  esquemaConsultaContacto,
  esquemaIdPrestador,
  esquemaPerfilPrestador,
} from "./prestadores.schema.js";
import { definirComunasAtencion, guardarMiPerfil, obtenerContacto, obtenerMiPerfil } from "./prestadores.service.js";

/**
 * Sin try/catch: Express 5 entrega el rechazo al manejador central de app.ts,
 * y el ZodError de parse() viaja por el mismo camino.
 *
 * Los permisos ya los revisaron autenticar, autorizar y, al escribir,
 * exigirCorreoVerificado. El controlador solo toma el id del token: nunca
 * del cuerpo ni de la URL, así no hay forma de pedir el perfil de otro.
 */
function idDelUsuario(req: Request): string {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }

  return req.usuario.id;
}

export async function obtenerYo(req: Request, res: Response) {
  res.status(200).json({ perfil: await obtenerMiPerfil(idDelUsuario(req)) });
}

export async function guardarYo(req: Request, res: Response) {
  const datos = esquemaPerfilPrestador.parse(req.body);
  const { perfil, creado } = await guardarMiPerfil(idDelUsuario(req), datos);

  // PUT idempotente que crea o reemplaza: 201 la primera vez, 200 después.
  res.status(creado ? 201 : 200).json({ perfil });
}

export async function definirComunas(req: Request, res: Response) {
  const { comunaIds } = esquemaComunasAtencion.parse(req.body);

  res.status(200).json({ comunas: await definirComunasAtencion(idDelUsuario(req), comunaIds) });
}

export async function contacto(req: Request, res: Response) {
  // Por separado a propósito: mezclarlos dejaría que ?id=... en la consulta
  // pisara el id de la ruta.
  const { id } = esquemaIdPrestador.parse(req.params);
  const { servicio } = esquemaConsultaContacto.parse(req.query);
  const resultado = await obtenerContacto(idDelUsuario(req), id, servicio);

  // Lleva un teléfono: ni el navegador ni un proxy lo guardan.
  res.set("Cache-Control", "no-store");
  res.status(200).json(resultado);
}
