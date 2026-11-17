import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "./auth.autorizar.js";
import { exigirCorreoVerificado } from "./auth.exigirCorreoVerificado.js";
import {
  cambiarContrasenaControlador,
  convertirEnPrestadorControlador,
  login,
  logout,
  recuperar,
  reenviarVerificacionControlador,
  refrescar,
  registrar,
  registrarPrestador,
  restablecer,
  verificarCorreoControlador,
  yo,
} from "./auth.controller.js";

export const rutasAuth = Router();

rutasAuth.post("/registro", registrar);
rutasAuth.post("/registro-prestador", registrarPrestador);
rutasAuth.post("/verificar-correo", verificarCorreoControlador);
rutasAuth.post("/reenviar-verificacion", reenviarVerificacionControlador);
rutasAuth.post("/recuperar", recuperar);
rutasAuth.post("/restablecer", restablecer);
rutasAuth.post("/cambiar-contrasena", autenticar, cambiarContrasenaControlador);
// Un cliente que quiere ofrecer servicios con el mismo correo: su cuenta pasa
// a ser de prestador. Solo un cliente, con el correo confirmado.
rutasAuth.post("/convertir-en-prestador", autenticar, autorizar(Rol.CLIENTE), exigirCorreoVerificado, convertirEnPrestadorControlador);
rutasAuth.post("/login", login);
rutasAuth.get("/yo", autenticar, yo);
rutasAuth.post("/refrescar", refrescar);
rutasAuth.post("/logout", logout);
