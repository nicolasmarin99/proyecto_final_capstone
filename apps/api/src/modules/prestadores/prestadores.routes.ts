import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { contacto, definirComunas, guardarYo, obtenerYo } from "./prestadores.controller.js";

export const rutasPrestadores = Router();

// Leer el propio perfil no exige correo verificado: quien no lo confirmó
// igual puede ver qué le falta. Escribir sí, porque un perfil público con
// un correo sin confirmar no identifica a nadie.
rutasPrestadores.get("/yo", autenticar, autorizar(Rol.PRESTADOR), obtenerYo);
rutasPrestadores.put("/yo", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, guardarYo);
rutasPrestadores.put("/yo/comunas", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, definirComunas);

// Contacto: basta con tener sesión, sea cual sea el rol. Se pasa autorizar
// con todos los roles para que además se compruebe en la base que la cuenta
// sigue activa (autenticar solo revisa la firma del token).
rutasPrestadores.get(
  "/:id/contacto",
  autenticar,
  autorizar(Rol.CLIENTE, Rol.PRESTADOR, Rol.ADMINISTRADOR),
  contacto,
);
