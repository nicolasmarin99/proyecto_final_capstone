import type { NextFunction, Request, Response } from "express";
import type { Rol } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import { buscarUsuarioPublicoPorId } from "./auth.repository.js";

/**
 * Devuelve la cuenta real del usuario de la petición, consultándola una sola
 * vez: si otro middleware ya la dejó en req.cuenta, se reutiliza. Así encadenar
 * varios autorizar() o leerla luego en un controlador no multiplica consultas.
 */
async function cargarCuenta(req: Request) {
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
