import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { guardarYo, obtenerYo } from "./prestadores.controller.js";

export const rutasPrestadores = Router();

// Leer el propio perfil no exige correo verificado: quien no lo confirmó
// igual puede ver qué le falta. Escribir sí, porque un perfil público con
// un correo sin confirmar no identifica a nadie.
rutasPrestadores.get("/yo", autenticar, autorizar(Rol.PRESTADOR), obtenerYo);
rutasPrestadores.put("/yo", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, guardarYo);
