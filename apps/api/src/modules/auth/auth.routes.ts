import { Router } from "express";
import { autenticar } from "../../middlewares/autenticar.js";
import {
  cambiarContrasenaControlador,
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
rutasAuth.post("/login", login);
rutasAuth.get("/yo", autenticar, yo);
rutasAuth.post("/refrescar", refrescar);
rutasAuth.post("/logout", logout);
