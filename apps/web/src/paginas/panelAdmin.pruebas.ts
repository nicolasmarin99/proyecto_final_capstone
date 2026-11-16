import { fireEvent, screen } from "@testing-library/react";

/*
  Utilidades de las pruebas del panel de administración.

  El panel está organizado por prestador: las colas (identidad,
  certificaciones, reportes, imágenes) ya no están a la vista al entrar, sino
  dentro de cada prestador que tiene algo pendiente. Las pruebas de cada cola
  simulan GET /admin/pendientes con cuerpoPendientes() y abren al prestador
  con abrirPrestador(), como lo haría el administrador.
*/

interface Conteo {
  identidad?: number;
  certificaciones?: number;
  cursos?: number;
  reportes?: number;
  imagenes?: number;
}

/** El cuerpo de GET /admin/pendientes para esos prestadores. */
export function cuerpoPendientes(prestadores: { id: string; nombre: string; pendientes: Conteo }[]) {
  return {
    prestadores: prestadores.map((prestador) => {
      const pendientes = { identidad: 0, certificaciones: 0, cursos: 0, reportes: 0, imagenes: 0, ...prestador.pendientes };
      return {
        id: prestador.id,
        nombre: prestador.nombre,
        pendientes,
        total: Object.values(pendientes).reduce((suma, cantidad) => suma + cantidad, 0),
        esperandoDesde: "2026-11-10T12:00:00.000Z",
      };
    }),
    pagina: 1,
    porPagina: 20,
    total: prestadores.length,
  };
}

/** Despliega al prestador en «Pendientes por prestador» y devuelve su botón. */
export async function abrirPrestador(nombre: RegExp): Promise<HTMLElement> {
  const boton = await screen.findByRole("button", { name: nombre, expanded: false });
  fireEvent.click(boton);
  return boton;
}
