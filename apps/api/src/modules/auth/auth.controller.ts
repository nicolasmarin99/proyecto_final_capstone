import type { Request, Response } from "express";
import { ErrorHttp } from "../../shared/errores.js";
import {
  esquemaCambiarContrasena,
  esquemaCorreoSolo,
  esquemaLogin,
  esquemaRegistro,
  esquemaRegistroPrestador,
  esquemaRestablecer,
  esquemaToken,
} from "./auth.schema.js";
import {
  cambiarContrasena,
  cerrarSesion,
  iniciarSesion,
  obtenerUsuarioActivo,
  reenviarVerificacion,
  refrescarSesion,
  registrarCliente,
  registrarPrestador as registrarPrestadorServicio,
  restablecerContrasena,
  solicitarRecuperacion,
  verificarCorreo,
} from "./auth.service.js";
import {
  NOMBRE_COOKIE_REFRESCO,
  opcionesCookieRefresco,
  opcionesLimpiezaCookie,
} from "./auth.tokens.js";

/**
 * Sin try/catch: Express 5 captura el rechazo de un manejador asíncrono y lo
 * entrega al manejador central de errores de app.ts. El ZodError de parse()
 * viaja por el mismo camino.
 */
/**
 * Respuesta única del registro y del reenvío de verificación.
 *
 * 202 y no 201: la petición se aceptó, pero el cuerpo no afirma que se haya
 * creado nada. Es literalmente cierto en los dos caminos, el de cuenta nueva y
 * el de correo ya registrado, y por eso no se puede distinguir cuál ocurrió.
 */
const RESPUESTA_REGISTRO = {
  mensaje: "Si el correo no estaba registrado, te enviamos un enlace para confirmarlo.",
};

export async function registrar(req: Request, res: Response) {
  const datos = esquemaRegistro.parse(req.body);
  await registrarCliente(datos);

  res.status(202).json(RESPUESTA_REGISTRO);
}

export async function verificarCorreoControlador(req: Request, res: Response) {
  const { token } = esquemaToken.parse(req.body);
  await verificarCorreo(token);

  res.status(200).json({ mensaje: "Tu correo quedó confirmado." });
}

export async function reenviarVerificacionControlador(req: Request, res: Response) {
  const { correo } = esquemaCorreoSolo.parse(req.body);
  await reenviarVerificacion(correo);

  res.status(202).json(RESPUESTA_REGISTRO);
}

export async function registrarPrestador(req: Request, res: Response) {
  const datos = esquemaRegistroPrestador.parse(req.body);
  await registrarPrestadorServicio(datos);

  res.status(202).json(RESPUESTA_REGISTRO);
}

/** req.cookies no viene tipado; se estrecha desde unknown en vez de usar any. */
function leerCookieRefresco(req: Request): string | null {
  const valor: unknown = req.cookies?.[NOMBRE_COOKIE_REFRESCO];

  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function agenteUsuario(req: Request): string | null {
  return req.get("user-agent") ?? null;
}

export async function login(req: Request, res: Response) {
  const datos = esquemaLogin.parse(req.body);
  const { accessToken, tokenRefresco, usuario } = await iniciarSesion(datos, agenteUsuario(req));

  // El token de refresco solo viaja en la cookie httpOnly, nunca en el cuerpo:
  // si estuviera en el JSON, cualquier script de la página podría leerlo.
  res.cookie(NOMBRE_COOKIE_REFRESCO, tokenRefresco, opcionesCookieRefresco());
  res.status(200).json({ accessToken, usuario });
}

export async function yo(req: Request, res: Response) {
  // autenticar() siempre deja req.usuario. La comprobación mantiene el tipo
  // honesto y protege si alguien montara esta ruta sin el middleware.
  if (!req.usuario) {
    throw new ErrorHttp(401, "TOKEN_INVALIDO", "El token de acceso no es válido.");
  }

  // Se relee desde la base en vez de confiar en la carga útil del token: el
  // rol o el estado de la cuenta pueden haber cambiado desde que se firmó.
  const usuario = await obtenerUsuarioActivo(req.usuario.id);

  res.status(200).json({ usuario });
}

export async function refrescar(req: Request, res: Response) {
  const { accessToken, tokenRefresco, usuario } = await refrescarSesion(
    leerCookieRefresco(req),
    agenteUsuario(req),
  );

  res.cookie(NOMBRE_COOKIE_REFRESCO, tokenRefresco, opcionesCookieRefresco());
  res.status(200).json({ accessToken, usuario });
}

export async function recuperar(req: Request, res: Response) {
  const { correo } = esquemaCorreoSolo.parse(req.body);
  await solicitarRecuperacion(correo);

  // 202 con cuerpo fijo: la respuesta no puede delatar si el correo existe.
  res.status(202).json({
    mensaje: "Si el correo tiene una cuenta, te enviamos un enlace para recuperarla.",
  });
}

export async function restablecer(req: Request, res: Response) {
  const { token, contrasena } = esquemaRestablecer.parse(req.body);
  await restablecerContrasena(token, contrasena);

  // La cookie del navegador apunta a una sesión que acaba de ser revocada.
  res.clearCookie(NOMBRE_COOKIE_REFRESCO, opcionesLimpiezaCookie());
  res.status(200).json({ mensaje: "Tu contraseña fue actualizada. Vuelve a iniciar sesión." });
}

export async function cambiarContrasenaControlador(req: Request, res: Response) {
  if (!req.usuario) {
    throw new ErrorHttp(401, "TOKEN_INVALIDO", "El token de acceso no es válido.");
  }

  const { contrasenaActual, contrasenaNueva } = esquemaCambiarContrasena.parse(req.body);

  await cambiarContrasena(
    req.usuario.id,
    contrasenaActual,
    contrasenaNueva,
    leerCookieRefresco(req),
  );

  res.status(200).json({ mensaje: "Tu contraseña fue actualizada." });
}

export async function logout(req: Request, res: Response) {
  await cerrarSesion(leerCookieRefresco(req));

  // Se limpia siempre, haya o no sesión: cerrar sesión nunca debe fallar ni
  // revelar si la cookie recibida correspondía a algo.
  res.clearCookie(NOMBRE_COOKIE_REFRESCO, opcionesLimpiezaCookie());
  res.status(204).end();
}
