import { env } from "../../env.js";
import type { CorreoSaliente } from "./correo.tipos.js";

/**
 * Plantillas de texto plano.
 *
 * Sin HTML por ahora: el texto plano llega igual en todos los clientes, no
 * arrastra imágenes remotas que delaten cuándo se abrió el correo, y es
 * bastante más difícil que termine marcado como spam.
 *
 * Ningún cuerpo lleva contraseñas ni datos personales más allá de lo
 * imprescindible. Los enlaces sí son credenciales de un solo uso, y por eso
 * duran poco y se invalidan al usarse; nunca deben registrarse en los logs.
 */

const FIRMA = "\n\nEquipo LocalCL\nEste es un correo automático, no respondas a esta dirección.";

function enlace(ruta: string, token: string): string {
  return `${env.URL_WEB}${ruta}?token=${encodeURIComponent(token)}`;
}

export function correoVerificacion(para: string, token: string): CorreoSaliente {
  return {
    para,
    asunto: "Confirma tu correo en LocalCL",
    cuerpo:
      "Te damos la bienvenida a LocalCL.\n\n" +
      "Para activar tu cuenta, abre este enlace:\n\n" +
      `${enlace("/verificar-correo", token)}\n\n` +
      "El enlace sirve una sola vez y vence en 24 horas.\n\n" +
      "Si no creaste esta cuenta, ignora este mensaje y no pasará nada." +
      FIRMA,
  };
}

/**
 * Se envía cuando alguien intenta registrarse con un correo que ya tiene
 * cuenta. Va a la dirección que ya existe, nunca a quien hizo el intento: si
 * la respuesta HTTP fuera distinta, el formulario de registro serviría para
 * averiguar quién está registrado.
 */
export function correoIntentoDeRegistro(para: string): CorreoSaliente {
  return {
    para,
    asunto: "Alguien intentó registrarse con tu correo en LocalCL",
    cuerpo:
      "Recibimos un intento de crear una cuenta en LocalCL con esta dirección, " +
      "que ya está registrada.\n\n" +
      "No hicimos ningún cambio y tu cuenta sigue igual.\n\n" +
      "Si fuiste tú, puedes iniciar sesión directamente:\n\n" +
      `${env.URL_WEB}/iniciar-sesion\n\n` +
      "Si no reconoces el intento y te preocupa, cambia tu contraseña." +
      FIRMA,
  };
}

export function correoRecuperacion(para: string, token: string): CorreoSaliente {
  return {
    para,
    asunto: "Recupera el acceso a tu cuenta de LocalCL",
    cuerpo:
      "Pediste recuperar el acceso a tu cuenta de LocalCL.\n\n" +
      "Abre este enlace para elegir una contraseña nueva:\n\n" +
      `${enlace("/restablecer-contrasena", token)}\n\n` +
      "El enlace sirve una sola vez y vence en 30 minutos.\n\n" +
      "Si no pediste esto, ignora el mensaje: tu contraseña no cambió y nadie " +
      "puede entrar con este correo." +
      FIRMA,
  };
}

/**
 * Aviso posterior al cambio. Es la única señal que recibe la persona si a
 * alguien más le cambian la contraseña, así que se envía siempre, tanto en el
 * restablecimiento por enlace como en el cambio con sesión iniciada.
 */
export function correoContrasenaCambiada(para: string): CorreoSaliente {
  return {
    para,
    asunto: "Tu contraseña de LocalCL cambió",
    cuerpo:
      "La contraseña de tu cuenta de LocalCL acaba de cambiar.\n\n" +
      "Por seguridad cerramos las demás sesiones abiertas.\n\n" +
      "Si no fuiste tú, recupera el acceso de inmediato:\n\n" +
      `${env.URL_WEB}/recuperar-cuenta` +
      FIRMA,
  };
}
