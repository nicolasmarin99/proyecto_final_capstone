import { Rol } from "../../generated/prisma/client.js";
import { contarUsuariosPorRol } from "./admin.repository.js";

export interface ResumenAdmin {
  totalUsuarios: number;
  porRol: Record<Rol, number>;
}

export async function obtenerResumen(): Promise<ResumenAdmin> {
  const grupos = await contarUsuariosPorRol();

  // La base solo devuelve los roles que tienen filas. Se parte de todos los
  // roles en cero para que la respuesta tenga siempre la misma forma y quien
  // la consuma no deba distinguir entre "cero" y "la clave no viene".
  const porRol: Record<Rol, number> = {
    [Rol.CLIENTE]: 0,
    [Rol.PRESTADOR]: 0,
    [Rol.ADMINISTRADOR]: 0,
  };

  for (const grupo of grupos) {
    porRol[grupo.rol] = grupo.total;
  }

  return {
    totalUsuarios: grupos.reduce((suma, grupo) => suma + grupo.total, 0),
    porRol,
  };
}
