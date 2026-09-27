import {
  esRutValido,
  LARGO_MAXIMO_CONTRASENA,
  LARGO_MINIMO_CONTRASENA,
  mensajeDeProblema,
  normalizarRut,
  revisarContrasena,
} from "@localcl/shared";
import { z } from "zod";

/**
 * Aplica las reglas compartidas al objeto completo, que es donde hace falta:
 * comprobar que la contraseña no contenga el correo ni el nombre exige ver los
 * tres campos a la vez, y un refinamiento de campo suelto no los tiene.
 *
 * El error se cuelga del campo "contrasena" para que la web lo muestre ahí.
 */
function exigirContrasenaAceptable<T extends { contrasena: string; correo?: string; nombre?: string }>(
  datos: T,
  contexto: z.RefinementCtx,
): void {
  const problema = revisarContrasena(datos.contrasena, {
    correo: datos.correo,
    nombre: datos.nombre,
  });

  if (problema) {
    contexto.addIssue({
      code: "custom",
      path: ["contrasena"],
      message: mensajeDeProblema(problema),
    });
  }
}

/**
 * Datos que acepta POST /auth/registro.
 *
 * El esquema no declara "rol" a propósito: Zod descarta las claves que no
 * están declaradas, así que un cliente no puede asignarse un rol enviándolo
 * en el cuerpo. El rol lo fija el servidor en el repositorio.
 */
const camposRegistro = z.object({
  nombre: z
    .string({ error: "El nombre es obligatorio." })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(100, "El nombre no puede superar los 100 caracteres."),
  correo: z
    .string({ error: "El correo es obligatorio." })
    .trim()
    .toLowerCase()
    .max(254, "El correo no puede superar los 254 caracteres.")
    // Se normaliza antes de validar el formato, para que "  ANA@X.CL " entre
    // como "ana@x.cl" y el duplicado se detecte aunque cambien las mayúsculas.
    .pipe(z.email("Debe ser un correo electrónico válido.")),
  contrasena: z
    .string({ error: "La contraseña es obligatoria." })
    .min(LARGO_MINIMO_CONTRASENA, mensajeDeProblema("MUY_CORTA"))
    .max(LARGO_MAXIMO_CONTRASENA, mensajeDeProblema("MUY_LARGA")),
});

// El refinamiento se aplica a cada esquema final y no a camposRegistro, porque
// extend() sobre un objeto ya refinado no arrastra el refinamiento.
export const esquemaRegistro = camposRegistro.superRefine(exigirContrasenaAceptable);

export type DatosRegistro = z.infer<typeof esquemaRegistro>;

/**
 * Datos que acepta POST /auth/registro-prestador.
 *
 * Reutiliza el esquema de clientes y le suma el RUT, de modo que las reglas de
 * nombre, correo y contraseña no puedan divergir entre ambos registros.
 *
 * Tampoco declara "rol": el servidor fija PRESTADOR igual que fija CLIENTE.
 */
export const esquemaRegistroPrestador = camposRegistro.extend({
  rut: z
    .string({ error: "El RUT es obligatorio." })
    // Se valida sobre lo que escribió la persona (esRutValido normaliza por
    // dentro) y recién después se guarda la forma canónica, para que la base
    // tenga una sola escritura posible de cada RUT.
    .refine(esRutValido, "El RUT no es válido.")
    .transform(normalizarRut),
}).superRefine(exigirContrasenaAceptable);

export type DatosRegistroPrestador = z.infer<typeof esquemaRegistroPrestador>;

/**
 * Datos que acepta POST /auth/login.
 *
 * El correo se normaliza igual que en el registro, pero aquí no se valida su
 * formato: si lo hiciéramos, un correo mal escrito respondería 400 y uno bien
 * escrito pero inexistente respondería 401, lo que empieza a distinguir casos.
 * Prefiero que todo fallo de credenciales se vea idéntico.
 *
 * La contraseña no lleva mínimo: quien se registró bajo otra política debe
 * poder entrar igual. El máximo sí se mantiene, porque Argon2 gasta memoria y
 * tiempo proporcionales a lo que recibe y es una vía barata de saturación.
 */
export const esquemaLogin = z.object({
  correo: z
    .string({ error: "El correo es obligatorio." })
    .trim()
    .toLowerCase()
    .max(254, "El correo no puede superar los 254 caracteres."),
  contrasena: z
    .string({ error: "La contraseña es obligatoria." })
    .max(128, "La contraseña no puede superar los 128 caracteres."),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;

/** El token viaja en el cuerpo y no en la URL: no queda en logs ni en el historial. */
export const esquemaToken = z.object({
  token: z
    .string({ error: "Falta el token del enlace." })
    .min(1, "Falta el token del enlace.")
    .max(200, "El token no es válido."),
});

/**
 * Reglas de largo de la contraseña nueva, tomadas de @localcl/shared.
 *
 * Acá no se puede comprobar que no contenga el correo ni el nombre porque el
 * cuerpo no los trae: al restablecer por enlace solo llegan el token y la
 * contraseña. Esa parte la hace el servicio, que sí conoce al usuario.
 */
const contrasenaNueva = z
  .string({ error: "La contraseña es obligatoria." })
  .min(LARGO_MINIMO_CONTRASENA, mensajeDeProblema("MUY_CORTA"))
  .max(LARGO_MAXIMO_CONTRASENA, mensajeDeProblema("MUY_LARGA"));

export const esquemaRestablecer = z.object({
  token: z
    .string({ error: "Falta el token del enlace." })
    .min(1, "Falta el token del enlace.")
    .max(200, "El token no es válido."),
  contrasena: contrasenaNueva,
});

export const esquemaCambiarContrasena = z.object({
  // Sin mínimo: quien se registró bajo otra política debe poder escribir la
  // suya. El máximo sí, porque Argon2 gasta memoria proporcional a la entrada.
  contrasenaActual: z
    .string({ error: "La contraseña actual es obligatoria." })
    .max(128, "La contraseña no puede superar los 128 caracteres."),
  contrasenaNueva,
});

export type DatosRestablecer = z.infer<typeof esquemaRestablecer>;
export type DatosCambiarContrasena = z.infer<typeof esquemaCambiarContrasena>;

export const esquemaCorreoSolo = z.object({
  correo: z
    .string({ error: "El correo es obligatorio." })
    .trim()
    .toLowerCase()
    .max(254, "El correo no puede superar los 254 caracteres."),
});
