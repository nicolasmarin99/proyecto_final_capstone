import { ErrorHttp } from "../../shared/errores.js";
import { registrarAceptacion, tieneTerminosPendientes, versionVigente } from "./terminos.repository.js";

/*
  Términos y condiciones (con la política de privacidad).

  - Al registrarse, la aceptación es obligatoria y queda guardada junto con
    la cuenta, en la misma escritura (auth.repository.ts).
  - Una cuenta que no aceptó la versión vigente (cuentas anteriores a esta
    regla, o una versión nueva) no puede usar ninguna ruta con sesión hasta
    aceptarla: lo impone autenticar() en el servidor, no la interfaz.
  - Se acepta una versión CONCRETA, la que la persona tuvo en pantalla: si
    entre medio rige otra, se rechaza y se le muestra la nueva.
*/

function sinTerminos(): ErrorHttp {
  return new ErrorHttp(503, "TERMINOS_NO_DISPONIBLES", "Los términos y condiciones no están disponibles. Intenta más tarde.");
}

export function terminosDesactualizados(): ErrorHttp {
  return new ErrorHttp(
    409,
    "TERMINOS_DESACTUALIZADOS",
    "Los términos y condiciones cambiaron mientras los leías. Revisa la versión vigente y vuelve a aceptarla.",
    [{ campo: "aceptaTerminos", mensaje: "Revisa la versión vigente de los términos y vuelve a aceptarla." }],
  );
}

/** El texto vigente, para leerlo antes de aceptar. Público. */
export async function vigente() {
  const version = await versionVigente();
  if (!version) throw sinTerminos();
  return { version: version.version, vigenteDesde: version.vigenteDesde, contenido: version.contenido };
}

/**
 * El id de la versión vigente, solo si es la que la persona dice haber leído.
 * Lo usa el registro para guardar la aceptación junto con la cuenta.
 */
export async function versionAAceptar(versionLeida: string): Promise<string> {
  const version = await versionVigente();
  if (!version) throw sinTerminos();
  if (version.version !== versionLeida) throw terminosDesactualizados();
  return version.id;
}

/** Una cuenta existente acepta la versión vigente. */
export async function aceptar(usuarioId: string, versionLeida: string) {
  await registrarAceptacion(usuarioId, await versionAAceptar(versionLeida));
  return { version: versionLeida, terminosPendientes: false };
}

export async function terminosPendientes(usuarioId: string): Promise<boolean> {
  return tieneTerminosPendientes(usuarioId);
}
