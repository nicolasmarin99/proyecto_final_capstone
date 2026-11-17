import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { verExtraccion } from "./lectura.controller.js";

/*
  /admin/extracciones — solo administradores. Lo leído de un documento (el
  nombre y el RUT de una cédula) lo ve únicamente quien revisa la solicitud:
  ni el prestador dueño del documento ni un cliente (403).

  Solo hay lectura (GET). No existe ninguna ruta que apruebe a partir de una
  extracción: aprobar es siempre PATCH /admin/identidades/:id/aprobar o
  /admin/certificaciones/:id/aprobar, hecho por un administrador.
*/
export const rutasExtraccionesAdmin = Router();

rutasExtraccionesAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasExtraccionesAdmin.get("/:credencialId", verExtraccion);
