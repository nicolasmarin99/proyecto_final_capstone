import { ErrorHttp } from "../../shared/errores.js";
import { existeComuna } from "../territorio/territorio.repository.js";
import { buscarPerfilPorUsuario, existePerfil, guardarPerfil } from "./prestadores.repository.js";
import type { DatosPerfilPrestador } from "./prestadores.schema.js";

export async function obtenerMiPerfil(usuarioId: string) {
  const perfil = await buscarPerfilPorUsuario(usuarioId);

  // 404 y no un perfil vacío: la web necesita distinguir "todavía no lo
  // creaste" para llevar al prestador a completarlo.
  if (!perfil) {
    throw new ErrorHttp(404, "PERFIL_NO_ENCONTRADO", "Aún no has creado tu perfil de prestador.");
  }

  return perfil;
}

/**
 * Crea o actualiza el perfil. Devuelve si fue una creación, para que el
 * controlador responda 201 o 200 según corresponda.
 */
export async function guardarMiPerfil(usuarioId: string, datos: DatosPerfilPrestador) {
  // La clave foránea también lo impediría, pero respondería un error de base
  // de datos sin campo. Comprobarlo antes permite decir "esta comuna no
  // existe" bajo el selector, con la misma forma que un error de Zod.
  if (!(await existeComuna(datos.comunaId))) {
    throw new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
      { campo: "comunaId", mensaje: "La comuna seleccionada no existe." },
    ]);
  }

  const creado = !(await existePerfil(usuarioId));
  const perfil = await guardarPerfil(usuarioId, datos);

  return { perfil, creado };
}
