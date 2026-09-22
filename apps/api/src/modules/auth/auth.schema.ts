import { z } from "zod";

/**
 * Datos que acepta POST /auth/registro.
 *
 * El esquema no declara "rol" a propósito: Zod descarta las claves que no
 * están declaradas, así que un cliente no puede asignarse un rol enviándolo
 * en el cuerpo. El rol lo fija el servidor en el repositorio.
 */
export const esquemaRegistro = z.object({
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
    .min(10, "La contraseña debe tener al menos 10 caracteres.")
    .max(128, "La contraseña no puede superar los 128 caracteres."),
});

export type DatosRegistro = z.infer<typeof esquemaRegistro>;

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
