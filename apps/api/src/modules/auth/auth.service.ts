import { randomBytes } from "node:crypto";
import { Algorithm, hash, hashSync, verify } from "@node-rs/argon2";
import { Prisma } from "../../generated/prisma/client.js";
import { ErrorHttp } from "../../shared/errores.js";
import { firmarAccessToken } from "../../shared/jwt.js";
import {
  buscarCredencialesPorCorreo,
  buscarSesionPorHash,
  buscarUsuarioPublicoPorId,
  crearCliente,
  crearSesion,
  revocarSesionPorHash,
  revocarSesionesDeUsuario,
  rotarSesion,
} from "./auth.repository.js";
import type { DatosLogin, DatosRegistro } from "./auth.schema.js";
import {
  MS_REFRESCO,
  generarTokenRefresco,
  hashearTokenRefresco,
} from "./auth.tokens.js";

/** Código de Prisma para una violación de restricción de unicidad. */
const VIOLACION_UNICIDAD = "P2002";

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

export async function registrarCliente(datos: DatosRegistro) {
  const hashContrasena = await hash(datos.contrasena, { algorithm: Algorithm.Argon2id });

  try {
    return await crearCliente({
      nombre: datos.nombre,
      correo: datos.correo,
      hashContrasena,
    });
  } catch (error) {
    // No se consulta si el correo ya existe antes de insertar. Hacerlo abre
    // una ventana de carrera entre la consulta y la escritura, y convierte el
    // endpoint en un oráculo para enumerar cuentas registradas. Se deja que la
    // restricción única de la base decida y se responde siempre lo mismo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === VIOLACION_UNICIDAD) {
      throw new ErrorHttp(
        409,
        "REGISTRO_NO_DISPONIBLE",
        "No fue posible completar el registro con los datos entregados.",
      );
    }

    throw error;
  }
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

/** Idempotente: sin cookie no hay nada que revocar y tampoco es un error. */
export async function cerrarSesion(token: string | null) {
  if (token) {
    await revocarSesionPorHash(hashearTokenRefresco(token));
  }
}
