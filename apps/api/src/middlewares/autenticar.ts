import type { NextFunction, Request, Response } from "express";
import { ErrorHttp } from "../shared/errores.js";
import { verificarAccessToken } from "../shared/jwt.js";

const PREFIJO = "Bearer ";

function tokenInvalido() {
  return new ErrorHttp(401, "TOKEN_INVALIDO", "El token de acceso no es válido.");
}

/**
 * Middleware síncrono: lo que lance lo recoge el manejador central de app.ts.
 *
 * Todas las causas de fallo (cabecera ausente, firma incorrecta, algoritmo no
 * permitido, token vencido o carga útil con otra forma) devuelven la misma
 * respuesta, para no darle pistas a quien esté probando tokens.
 */
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization;

  if (!cabecera?.startsWith(PREFIJO)) {
    throw tokenInvalido();
  }

  try {
    const { sub, rol } = verificarAccessToken(cabecera.slice(PREFIJO.length).trim());
    req.usuario = { id: sub, rol };
  } catch {
    throw tokenInvalido();
  }

  next();
}
