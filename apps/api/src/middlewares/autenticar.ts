import type { NextFunction, Request, Response } from "express";
import { ErrorHttp } from "../shared/errores.js";
import { verificarAccessToken } from "../shared/jwt.js";
import { terminosPendientes } from "../modules/terminos/terminos.service.js";

const PREFIJO = "Bearer ";

function tokenInvalido() {
  return new ErrorHttp(401, "TOKEN_INVALIDO", "El token de acceso no es válido.");
}

/** Valida el token y deja req.usuario. Lanza el mismo 401 para toda causa de fallo. */
function leerToken(req: Request) {
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
}

/**
 * Exige una sesión válida Y la versión vigente de los términos aceptada.
 * Es el middleware de TODAS las rutas con sesión: así una ruta nueva queda
 * protegida sin acordarse de nada, y una cuenta que no aceptó los términos
 * (anterior a esta regla, o ante una versión nueva) no puede usar la
 * plataforma llamando a la API directamente, aunque la web la detenga antes.
 *
 * Lo que lance lo recoge el manejador central de app.ts (Express 5 entrega
 * los rechazos de un middleware asíncrono). Todas las causas de fallo del
 * token (cabecera ausente, firma incorrecta, algoritmo no permitido, token
 * vencido o carga útil con otra forma) devuelven la misma respuesta, para no
 * darle pistas a quien esté probando tokens.
 */
export async function autenticar(req: Request, _res: Response, next: NextFunction) {
  leerToken(req);

  if (req.usuario && (await terminosPendientes(req.usuario.id))) {
    throw new ErrorHttp(403, "TERMINOS_PENDIENTES", "Debes aceptar los términos y condiciones vigentes para continuar.");
  }

  next();
}

/**
 * Solo la sesión, sin exigir los términos. ÚNICAMENTE para lo que una
 * cuenta necesita para llegar a aceptarlos: saber quién es (/auth/yo, que
 * informa terminosPendientes) y aceptarlos (/terminos/aceptar).
 */
export function autenticarSinExigirTerminos(req: Request, _res: Response, next: NextFunction) {
  leerToken(req);
  next();
}
