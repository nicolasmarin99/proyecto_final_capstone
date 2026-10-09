import { Router } from "express";
import { z } from "zod";
import type { Request, Response } from "express";
import { autenticar } from "../../middlewares/autenticar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";

/**
 * PROVISIONAL — maniquí hasta el sprint de catálogo.
 *
 * Existe para que exigirCorreoVerificado esté montado sobre un endpoint real y
 * cubierto por pruebas, en vez de ser un middleware sin usar. No persiste nada:
 * la tabla servicios ya existe (migración de catálogo), pero el módulo que la
 * usa, con su esquema Zod en @localcl/shared y sus capas, es trabajo aparte.
 *
 * Cuando llegue el catálogo, este archivo se reemplaza por el módulo completo
 * con sus capas, y la línea de middlewares de la ruta se mantiene igual.
 */
const esquemaPublicacion = z.object({
  titulo: z
    .string({ error: "El título es obligatorio." })
    .trim()
    .min(5, "El título debe tener al menos 5 caracteres.")
    .max(120, "El título no puede superar los 120 caracteres."),
});

export const rutasServicios = Router();

rutasServicios.post(
  "/",
  autenticar,
  exigirCorreoVerificado,
  (req: Request, res: Response) => {
    const datos = esquemaPublicacion.parse(req.body);

    res.status(201).json({
      servicio: { titulo: datos.titulo, prestadorId: req.usuario?.id ?? null },
      aviso: "Endpoint provisional: todavía no guarda nada.",
    });
  },
);
