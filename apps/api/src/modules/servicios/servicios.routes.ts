import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import {
  crearServicio,
  editarServicio,
  eliminarServicio,
  listarCategorias,
  misServicios,
  servicioPublico,
} from "./servicios.controller.js";

export const rutasServicios = Router();

/** Escribir exige ser prestador y tener el correo confirmado. */
const prestadorVerificado = [autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado];

// /mios antes que /:id: si no, Express tomaría "mios" como un id.
rutasServicios.get("/mios", autenticar, autorizar(Rol.PRESTADOR), misServicios);
rutasServicios.get("/:id", servicioPublico);
rutasServicios.post("/", ...prestadorVerificado, crearServicio);
rutasServicios.put("/:id", ...prestadorVerificado, editarServicio);
rutasServicios.delete("/:id", ...prestadorVerificado, eliminarServicio);

// /categorias: pública, para el selector del formulario.
export const rutasCategorias = Router();

rutasCategorias.get("/", listarCategorias);
