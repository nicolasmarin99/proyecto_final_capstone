import type { Request } from "express";
import { buscarUsuarioPublicoPorId } from "./auth.repository.js";

/**
 * Devuelve la cuenta real del usuario de la petición, consultándola una sola
 * vez: si otro middleware ya la dejó en req.cuenta, se reutiliza.
 *
 * Vive acá y no dentro de un middleware concreto porque la usan varios
 * (autorizar, exigirCorreoVerificado) y encadenarlos no debe multiplicar
 * consultas a la base.
 */
export async function cargarCuenta(req: Request) {
  if (req.cuenta) {
    return req.cuenta;
  }

  if (!req.usuario) {
    return null;
  }

  const usuario = await buscarUsuarioPublicoPorId(req.usuario.id);

  if (usuario) {
    req.cuenta = usuario;
  }

  return req.cuenta ?? null;
}
