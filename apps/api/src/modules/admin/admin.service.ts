import { Rol } from "../../generated/prisma/client.js";
import { contarUsuariosPorRol, prestadoresConPendientes } from "./admin.repository.js";

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

/**
 * El panel organizado por prestador: quién tiene algo por revisar y qué.
 * `total` es la suma de todo lo pendiente de ese prestador; `prestadores`,
 * cuántos prestadores hay en total (para paginar).
 */
export async function obtenerPendientes(pagina: number, porPagina: number) {
  const filas = await prestadoresConPendientes(porPagina, (pagina - 1) * porPagina);

  return {
    prestadores: filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      pendientes: {
        identidad: fila.identidad,
        certificaciones: fila.certificaciones,
        cursos: fila.cursos,
        reportes: fila.reportes,
        imagenes: fila.imagenes,
      },
      total: fila.identidad + fila.certificaciones + fila.cursos + fila.reportes + fila.imagenes,
      esperandoDesde: fila.desde,
    })),
    pagina,
    porPagina,
    // Fuera de rango (página más allá del final) no hay filas de donde leerlo.
    total: filas[0]?.total ?? 0,
  };
}
