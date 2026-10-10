import type { Request, Response } from "express";
import { obtenerComunas } from "./territorio.service.js";

/**
 * Lista pública: no requiere sesión, porque la necesita cualquier formulario
 * que pida una comuna, incluido uno de búsqueda sin cuenta.
 *
 * Las comunas cambian por ley, no por uso: se permite al navegador guardar la
 * respuesta una hora para no repetir 346 filas en cada visita al formulario.
 */
export async function comunas(_req: Request, res: Response) {
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).json({ comunas: await obtenerComunas() });
}
