import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { resumen } from "./admin.controller.js";

export const rutasAdmin = Router();

// El orden importa: autenticar establece quién es, autorizar decide si puede.
rutasAdmin.get("/resumen", autenticar, autorizar(Rol.ADMINISTRADOR), resumen);
