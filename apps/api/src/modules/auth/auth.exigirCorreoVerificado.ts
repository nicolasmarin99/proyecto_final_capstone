import type { NextFunction, Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import { cargarCuenta } from "./auth.cuenta.js";

/**
 * Exige que la cuenta tenga el correo confirmado. Se monta después de
 * autenticar, igual que autorizar.
 *
 * Quien no ha verificado su correo puede entrar y mirar: lo que no puede es
 * dejar rastro en la plataforma, porque una dirección sin confirmar no
 * identifica a nadie y convierte cualquier publicación o valoración en algo
 * imposible de responsabilizar.
 *
 * El estado se lee de la base y no del token, por lo mismo que el rol: quien
 * verifica su correo debe poder publicar de inmediato, sin esperar a que
 * venza su token de acceso.
 */
export async function exigirCorreoVerificado(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.usuario) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Debes iniciar sesión para continuar.");
  }

  const cuenta = await cargarCuenta(req);

  if (!cuenta || !cuenta.activo) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Tu sesión ya no es válida.");
  }

  // 403 y no 401: la sesión es legítima, lo que falta es un paso de la cuenta.
  // Responder 401 haría que la web intentara refrescar el token, que no
  // arreglaría nada, en vez de mostrar el aviso de verificación.
  if (!cuenta.correoVerificado) {
    throw new ErrorHttp(
      403,
      "CORREO_NO_VERIFICADO",
      "Confirma tu correo para poder realizar esta acción.",
    );
  }

  next();
}
