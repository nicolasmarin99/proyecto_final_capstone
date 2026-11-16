import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { pendientes, resumen } from "./admin.controller.js";

export const rutasAdmin = Router();

// El orden importa: autenticar establece quién es, autorizar decide si puede.
rutasAdmin.get("/resumen", autenticar, autorizar(Rol.ADMINISTRADOR), resumen);
// El panel por prestador: quién tiene algo por revisar y cuánto de cada tipo.
rutasAdmin.get("/pendientes", autenticar, autorizar(Rol.ADMINISTRADOR), pendientes);
