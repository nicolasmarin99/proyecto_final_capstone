import { EnviadorEnMemoria, obtenerEnviador } from "../src/modules/correo/index.js";

/**
 * Da acceso a la bandeja en memoria para poder afirmar sobre lo enviado.
 *
 * Vive en tests/ y no en src/ a propósito: el código de producción no debería
 * exportar una puerta pensada solo para las pruebas. Acá el estrechamiento de
 * tipo se hace una vez y todas las pruebas lo reutilizan.
 */
export function bandeja(): EnviadorEnMemoria {
  const enviador = obtenerEnviador();

  if (!(enviador instanceof EnviadorEnMemoria)) {
    throw new Error(
      "Las pruebas requieren CORREO_TRANSPORTE=memoria. Revisa apps/api/.env.test.",
    );
  }

  return enviador;
}
