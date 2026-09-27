import { randomBytes } from "node:crypto";
import { Algorithm, hash, hashSync, verify } from "@node-rs/argon2";
import {
  MENSAJE_CONTRASENA_FILTRADA,
  mensajeDeProblema,
  revisarContrasena,
} from "@localcl/shared";
import { Prisma, TipoToken } from "../../generated/prisma/client.js";
import { estaFiltrada } from "./auth.filtradas.js";
import { ErrorHttp } from "../../shared/errores.js";
import { firmarAccessToken } from "../../shared/jwt.js";
import { generarToken, hashearToken } from "../../shared/tokens.js";
import { enviarSinInterrumpir } from "../correo/index.js";
import {
  correoContrasenaCambiada,
  correoIntentoDeRegistro,
  correoRecuperacion,
  correoVerificacion,
} from "../correo/correo.plantillas.js";
import {
  actualizarHashContrasena,
  buscarCredencialesPorCorreo,
  buscarCredencialesPorId,
  buscarSesionPorHash,
  buscarTokenCuenta,
  buscarUsuarioPublicoPorId,
  crearCliente,
  crearPrestador,
  crearSesion,
  crearTokenCuenta,
  invalidarTokensPendientes,
  marcarCorreoVerificado,
  marcarTokenUsado,
  revocarSesionPorHash,
  revocarSesionesDeUsuario,
  revocarSesionesSalvo,
  rotarSesion,
  ultimoTokenEmitido,
} from "./auth.repository.js";
import type { DatosLogin, DatosRegistro, DatosRegistroPrestador } from "./auth.schema.js";
import {
  MS_REFRESCO,
  generarTokenRefresco,
  hashearTokenRefresco,
} from "./auth.tokens.js";

/** Código de Prisma para una violación de restricción de unicidad. */
const VIOLACION_UNICIDAD = "P2002";

/**
 * Vigencia de cada tipo de enlace. La verificación dura un día porque la
 * persona puede revisar el correo más tarde y no hay nada urgente en juego.
 * La recuperación dura media hora porque ese enlace sí da acceso a la cuenta,
 * y cada minuto extra es tiempo en que sirve si alguien intercepta el correo.
 */
const VIGENCIA_MS: Record<TipoToken, number> = {
  [TipoToken.VERIFICACION_CORREO]: 24 * 60 * 60 * 1000,
  [TipoToken.RECUPERACION_CONTRASENA]: 30 * 60 * 1000,
};

/** Espera mínima entre reenvíos del enlace de verificación. */
const ESPERA_REENVIO_MS = 2 * 60 * 1000;

/**
 * Hash de un valor aleatorio que nadie conoce. Cuando el correo no existe se
 * compara contra él, de modo que la respuesta tarde lo mismo que con una
 * cuenta real. Sin esto, la diferencia de tiempo entre "no busqué nada" y
 * "verifiqué un Argon2" delata qué correos están registrados.
 */
const HASH_FICTICIO = hashSync(randomBytes(32).toString("base64url"), {
  algorithm: Algorithm.Argon2id,
});

/** Una sola respuesta para todo fallo de credenciales, sin distinguir la causa. */
function credencialesInvalidas() {
  return new ErrorHttp(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.");
}

function sesionInvalida() {
  return new ErrorHttp(401, "SESION_INVALIDA", "La sesión no es válida o ya expiró.");
}

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : null;
}

/**
 * Identifica qué restricción de unicidad se violó.
 *
 * Con el adaptador pg de Prisma 7 el dato NO viene en meta.target, que es
 * donde lo pone Prisma clásico: llega dentro del error del driver, como el
 * nombre del índice ("usuarios_correo_key"). Se leen las dos formas para no
 * depender de la versión, y si ninguna calza se devuelve cadena vacía, caso
 * que quien llama registra de forma ruidosa en vez de asumir algo.
 */
function restriccionViolada(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = comoRegistro(error.meta);

  if (!meta) {
    return "";
  }

  if (typeof meta.target === "string") {
    return meta.target;
  }

  if (Array.isArray(meta.target)) {
    return meta.target.filter((campo): campo is string => typeof campo === "string").join(",");
  }

  const causa = comoRegistro(comoRegistro(meta.driverAdapterError)?.cause);
  const indice = comoRegistro(causa?.constraint)?.index;

  return typeof indice === "string" ? indice : "";
}

function esViolacionDeUnicidad(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === VIOLACION_UNICIDAD
  );
}

/** Emite un token de un solo uso y devuelve el valor en claro, que solo existe acá. */
async function emitirToken(usuarioId: string, tipo: TipoToken): Promise<string> {
  // Los anteriores del mismo propósito se queman: si alguien pide un reenvío
  // porque sospecha que le interceptaron el correo, el enlace viejo debe dejar
  // de servir en ese mismo momento.
  await invalidarTokensPendientes(usuarioId, tipo);

  const token = generarToken();

  await crearTokenCuenta({
    usuarioId,
    tipo,
    hashToken: hashearToken(token),
    expiraEn: new Date(Date.now() + VIGENCIA_MS[tipo]),
  });

  return token;
}

async function enviarVerificacion(usuarioId: string, correo: string): Promise<void> {
  const token = await emitirToken(usuarioId, TipoToken.VERIFICACION_CORREO);

  await enviarSinInterrumpir(correoVerificacion(correo, token));
}

/**
 * Crea la cuenta y manda el enlace de verificación. Si el correo ya tenía
 * cuenta, no crea nada y avisa a esa dirección.
 *
 * El registro ya no distingue por respuesta si el correo existía: siempre
 * responde lo mismo. Antes devolvía 409 ante un duplicado, y eso convertía el
 * formulario de registro en una forma de averiguar quién tiene cuenta en la
 * plataforma. El costo asumido es de usabilidad: quien se equivoca de correo
 * no recibe aviso en pantalla y se entera solo al abrir su bandeja.
 *
 * Tampoco se consulta si el correo existe antes de insertar: eso abriría una
 * ventana de carrera entre la consulta y la escritura. Decide la restricción
 * única de la base.
 */
async function registrarCuenta(
  correo: string,
  crear: () => Promise<{ id: string; correo: string }>,
): Promise<void> {
  try {
    const usuario = await crear();

    await enviarVerificacion(usuario.id, usuario.correo);
  } catch (error) {
    if (!esViolacionDeUnicidad(error)) {
      throw error;
    }

    const restriccion = restriccionViolada(error);

    if (restriccion.includes("correo")) {
      // El aviso va a la dirección que YA tiene cuenta, no a quien hizo el
      // intento: son la misma cadena de texto, pero la diferencia importa,
      // porque es su dueño quien necesita enterarse.
      await enviarSinInterrumpir(correoIntentoDeRegistro(correo));
      return;
    }

    if (restriccion.includes("rut")) {
      // No se avisa por correo: quien envió el formulario no es necesariamente
      // el dueño de ese RUT, y escribirle al dueño real convertiría el registro
      // en una vía para molestarlo repitiendo su RUT. Queda en el log.
      console.warn("Registro rechazado: el RUT ya está asociado a una cuenta.");
      return;
    }

    // No se pudo identificar la restricción. Se registra fuerte porque
    // significa que cambió la forma del error de Prisma y el aviso al dueño
    // del correo dejó de enviarse sin que nada más lo delate.
    console.error("Violación de unicidad no reconocida al registrar:", error.meta);
  }
}

export async function registrarCliente(datos: DatosRegistro): Promise<void> {
  await exigirContrasenaUsable(datos.contrasena, datos);

  const hashContrasena = await hash(datos.contrasena, { algorithm: Algorithm.Argon2id });

  await registrarCuenta(datos.correo, () =>
    crearCliente({
      nombre: datos.nombre,
      correo: datos.correo,
      hashContrasena,
    }),
  );
}

export async function registrarPrestador(datos: DatosRegistroPrestador): Promise<void> {
  await exigirContrasenaUsable(datos.contrasena, datos);

  const hashContrasena = await hash(datos.contrasena, { algorithm: Algorithm.Argon2id });

  await registrarCuenta(datos.correo, () =>
    crearPrestador({
      nombre: datos.nombre,
      correo: datos.correo,
      hashContrasena,
      rut: datos.rut,
    }),
  );
}

/**
 * Comprobaciones de contraseña que el esquema Zod no puede hacer: necesitan
 * conocer al usuario, o salir a internet.
 *
 * El error se cuelga del campo "contrasena" para que la respuesta tenga la
 * misma forma que un error de validación y la web lo muestre bajo el campo.
 */
async function exigirContrasenaUsable(
  contrasena: string,
  datos: { correo?: string; nombre?: string },
): Promise<void> {
  const problema = revisarContrasena(contrasena, datos);

  if (problema) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "contrasena", mensaje: mensajeDeProblema(problema) },
    ]);
  }

  if (await estaFiltrada(contrasena)) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "contrasena", mensaje: MENSAJE_CONTRASENA_FILTRADA },
    ]);
  }
}

/** Mismo error para un token inventado, uno ya usado y uno vencido. */
function enlaceInvalido() {
  return new ErrorHttp(400, "ENLACE_INVALIDO", "El enlace no es válido o ya expiró.");
}

export async function verificarCorreo(token: string): Promise<void> {
  const registro = await buscarTokenCuenta(hashearToken(token), TipoToken.VERIFICACION_CORREO);

  if (!registro || registro.usadoEn !== null || registro.expiraEn.getTime() <= Date.now()) {
    throw enlaceInvalido();
  }

  // Marcar y comprobar en una sola escritura condicional: si dos peticiones
  // canjean el mismo enlace a la vez, solo una obtiene true.
  if (!(await marcarTokenUsado(registro.id))) {
    throw enlaceInvalido();
  }

  await marcarCorreoVerificado(registro.usuarioId);
}

/**
 * Reenvío del enlace de verificación. Responde siempre igual, exista o no la
 * cuenta, por la misma razón que el registro.
 */
export async function reenviarVerificacion(correo: string): Promise<void> {
  const usuario = await buscarCredencialesPorCorreo(correo);

  if (!usuario || !usuario.activo || usuario.correoVerificado) {
    return;
  }

  // Freno de reenvíos: sin esto, el endpoint sirve para inundar de correos a
  // cualquier dirección registrada, y además cada reenvío invalida el enlace
  // anterior, así que quien recibe el bombardeo no logra usar ninguno.
  const ultimo = await ultimoTokenEmitido(usuario.id, TipoToken.VERIFICACION_CORREO);

  if (ultimo && Date.now() - ultimo.creadoEn.getTime() < ESPERA_REENVIO_MS) {
    return;
  }

  await enviarVerificacion(usuario.id, usuario.correo);
}

export async function iniciarSesion(datos: DatosLogin, agenteUsuario: string | null) {
  const registro = await buscarCredencialesPorCorreo(datos.correo);

  // La verificación se ejecuta siempre, exista o no la cuenta y tenga o no
  // contraseña local, para que el costo en tiempo sea el mismo en todos los
  // casos. Recién después se decide, y el rechazo es siempre el mismo.
  const hashAComparar = registro?.hashContrasena ?? HASH_FICTICIO;
  const contrasenaCoincide = await verify(hashAComparar, datos.contrasena);

  if (!registro) {
    throw credencialesInvalidas();
  }

  // Cuenta creada solo con un proveedor externo: no tiene contraseña local,
  // así que no hay nada contra qué autenticar por esta vía.
  if (registro.hashContrasena === null) {
    throw credencialesInvalidas();
  }

  if (!registro.activo) {
    throw credencialesInvalidas();
  }

  if (!contrasenaCoincide) {
    throw credencialesInvalidas();
  }

  // Se descarta el hash de forma explícita: lo que sigue ya no puede filtrarlo.
  const { hashContrasena, ...usuario } = registro;
  void hashContrasena;

  const tokenRefresco = generarTokenRefresco();

  await crearSesion({
    usuarioId: usuario.id,
    hashToken: hashearTokenRefresco(tokenRefresco),
    expiraEn: new Date(Date.now() + MS_REFRESCO),
    agenteUsuario,
  });

  return {
    accessToken: firmarAccessToken({ sub: usuario.id, rol: usuario.rol }),
    tokenRefresco,
    usuario,
  };
}

export async function obtenerUsuarioActivo(id: string) {
  const usuario = await buscarUsuarioPublicoPorId(id);

  // El token sigue siendo válido por su firma, pero la cuenta pudo eliminarse
  // o desactivarse después de emitirlo. El estado manda sobre el token.
  if (!usuario || !usuario.activo) {
    throw new ErrorHttp(401, "TOKEN_INVALIDO", "El token de acceso no es válido.");
  }

  return usuario;
}

export async function refrescarSesion(token: string | null, agenteUsuario: string | null) {
  if (!token) {
    throw sesionInvalida();
  }

  const sesion = await buscarSesionPorHash(hashearTokenRefresco(token));

  if (!sesion) {
    throw sesionInvalida();
  }

  // Detección de robo. Un token ya rotado que vuelve a aparecer significa que
  // alguien más conservaba una copia: o el atacante usa el viejo, o la víctima
  // usa el suyo después de que el atacante rotó. No se puede saber cuál es
  // cuál, así que se cortan todas las sesiones y ambos deben volver a entrar.
  // Se comprueba antes que el vencimiento porque la señal de robo importa
  // aunque el token robado ya estuviera vencido.
  if (sesion.revocadaEn !== null) {
    await revocarSesionesDeUsuario(sesion.usuarioId);
    throw sesionInvalida();
  }

  if (sesion.expiraEn.getTime() <= Date.now()) {
    throw sesionInvalida();
  }

  const usuario = await buscarUsuarioPublicoPorId(sesion.usuarioId);

  if (!usuario || !usuario.activo) {
    throw sesionInvalida();
  }

  const nuevoToken = generarTokenRefresco();

  await rotarSesion({
    sesionAnteriorId: sesion.id,
    usuarioId: sesion.usuarioId,
    hashToken: hashearTokenRefresco(nuevoToken),
    expiraEn: new Date(Date.now() + MS_REFRESCO),
    agenteUsuario,
  });

  return {
    accessToken: firmarAccessToken({ sub: usuario.id, rol: usuario.rol }),
    tokenRefresco: nuevoToken,
    usuario,
  };
}

/**
 * Solicitud de recuperación. Responde siempre igual, exista o no la cuenta:
 * si dijera "no encontramos ese correo", el formulario de recuperación pasaría
 * a ser la forma más cómoda de averiguar quién tiene cuenta.
 */
export async function solicitarRecuperacion(correo: string): Promise<void> {
  const usuario = await buscarCredencialesPorCorreo(correo);

  if (!usuario || !usuario.activo) {
    return;
  }

  // Mismo freno que en el reenvío de verificación: sin él, el endpoint sirve
  // para inundar de correos a cualquier dirección registrada, y como cada
  // emisión invalida la anterior, quien lo recibe no logra usar ningún enlace.
  const ultimo = await ultimoTokenEmitido(usuario.id, TipoToken.RECUPERACION_CONTRASENA);

  if (ultimo && Date.now() - ultimo.creadoEn.getTime() < ESPERA_REENVIO_MS) {
    return;
  }

  const token = await emitirToken(usuario.id, TipoToken.RECUPERACION_CONTRASENA);

  await enviarSinInterrumpir(correoRecuperacion(usuario.correo, token));
}

/**
 * Canjea el enlace de recuperación por una contraseña nueva.
 *
 * Cierra TODAS las sesiones, incluida la de quien está restableciendo. Es
 * deliberado: el motivo habitual para recuperar una contraseña es sospechar
 * que alguien más entró, y dejar viva cualquier sesión abierta anularía el
 * sentido del trámite. La persona vuelve a entrar con su contraseña nueva.
 */
export async function restablecerContrasena(token: string, contrasena: string): Promise<void> {
  const registro = await buscarTokenCuenta(
    hashearToken(token),
    TipoToken.RECUPERACION_CONTRASENA,
  );

  if (!registro || registro.usadoEn !== null || registro.expiraEn.getTime() <= Date.now()) {
    throw enlaceInvalido();
  }

  const usuario = await buscarUsuarioPublicoPorId(registro.usuarioId);

  if (!usuario || !usuario.activo) {
    throw enlaceInvalido();
  }

  // La contraseña se revisa ANTES de quemar el token. Al revés, elegir una
  // contraseña rechazada dejaría el enlace inservible y obligaría a pedir otro,
  // que es un castigo absurdo por escribir algo demasiado corto.
  // Recién acá se conocen el correo y el nombre: el cuerpo solo traía el token.
  await exigirContrasenaUsable(contrasena, usuario);

  // Marcar y comprobar en una sola escritura condicional: si dos peticiones
  // canjean el mismo enlace a la vez, solo una obtiene true.
  if (!(await marcarTokenUsado(registro.id))) {
    throw enlaceInvalido();
  }

  await actualizarHashContrasena(
    registro.usuarioId,
    await hash(contrasena, { algorithm: Algorithm.Argon2id }),
  );

  await revocarSesionesDeUsuario(registro.usuarioId);

  // Cualquier otro enlace de recuperación pendiente deja de servir: si un
  // atacante alcanzó a pedir uno, no puede usarlo después de este cambio.
  await invalidarTokensPendientes(registro.usuarioId, TipoToken.RECUPERACION_CONTRASENA);

  await enviarSinInterrumpir(correoContrasenaCambiada(usuario.correo));
}

/**
 * Cambio de contraseña con la sesión abierta.
 *
 * Se exige la contraseña actual aunque la sesión ya esté autenticada: si
 * bastara el token, quien tomara prestado un computador desbloqueado podría
 * adueñarse de la cuenta cambiando la clave sin conocerla.
 */
export async function cambiarContrasena(
  usuarioId: string,
  contrasenaActual: string,
  contrasenaNueva: string,
  tokenRefrescoActual: string | null,
): Promise<void> {
  const usuario = await buscarCredencialesPorId(usuarioId);

  if (!usuario || !usuario.activo || usuario.hashContrasena === null) {
    throw new ErrorHttp(401, "NO_AUTENTICADO", "Tu sesión ya no es válida.");
  }

  if (!(await verify(usuario.hashContrasena, contrasenaActual))) {
    // 400 y no 401: la sesión es válida, lo que no cuadra es un dato del
    // cuerpo. Con 401 el cliente web intentaría refrescar el token y reenviar,
    // que no arregla nada y repetiría el intento fallido.
    throw new ErrorHttp(
      400,
      "CONTRASENA_ACTUAL_INCORRECTA",
      "La contraseña actual no es correcta.",
    );
  }

  await exigirContrasenaUsable(contrasenaNueva, usuario);

  await actualizarHashContrasena(
    usuarioId,
    await hash(contrasenaNueva, { algorithm: Algorithm.Argon2id }),
  );

  // Se conserva la sesión desde la que se pidió el cambio y se cierran las
  // demás: quien cambia su contraseña espera seguir trabajando donde está, y
  // a la vez expulsar cualquier sesión que no reconozca.
  await revocarSesionesSalvo(
    usuarioId,
    tokenRefrescoActual ? hashearTokenRefresco(tokenRefrescoActual) : null,
  );

  await enviarSinInterrumpir(correoContrasenaCambiada(usuario.correo));
}

/** Idempotente: sin cookie no hay nada que revocar y tampoco es un error. */
export async function cerrarSesion(token: string | null) {
  if (token) {
    await revocarSesionPorHash(hashearTokenRefresco(token));
  }
}
