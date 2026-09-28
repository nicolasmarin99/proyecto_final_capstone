import type { NextFunction, Request, Response } from "express";
import type { Rol } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import { cargarCuenta } from "./auth.cuenta.js";

/**
 * Restringe una ruta a los roles indicados. Se monta siempre DESPUÉS de
 * autenticar, que es quien valida el token y deja req.usuario.
 *
 * El rol se lee de la base y no del token. Un JWT es una foto del momento en
 * que se firmó: si se confiara en su contenido, degradar a un administrador o
 * suspender una cuenta no tendría efecto hasta que venciera el token. Leer la
 * fila cuesta una consulta y hace que el cambio valga de inmediato.
 */
export function autorizar(...roles: Rol[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) {
      throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
    }

    const cuenta = await cargarCuenta(req);

    // La cuenta ya no existe o fue suspendida: el token es válido por su firma
    // pero ya no representa a nadie. Es 401 y no 403 porque el problema no son
    // los permisos, es que la sesión dejó de ser legítima.
    if (!cuenta || !cuenta.activo) {
      throw new ErrorHttp(401, "NO_AUTENTICADO", "Tu sesión ya no es válida.");
    }

    if (!roles.includes(cuenta.rol)) {
      throw new ErrorHttp(403, "SIN_PERMISOS", "No tienes permisos para realizar esta acción.");
    }

    next();
  };
}
