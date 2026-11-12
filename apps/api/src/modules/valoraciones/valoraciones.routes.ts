import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { crear, crearObjecion, listarPublicas, listarRecibidas, obtenerPropia } from "./valoraciones.controller.js";

/*
  Ninguna ruta de este archivo edita, oculta ni borra una valoración. El
  cliente publica la suya una sola vez y queda definitiva (no hay PUT,
  PATCH ni DELETE); el prestador solo objeta; ocultar es una decisión del
  administrador en /admin/reportes (reportes.routes.ts).
*/

// /prestadores/:id/valoraciones — se monta dentro de las rutas de prestadores.
export const rutasValoracionesPrestador = Router({ mergeParams: true });

// Pública: la lista y el resumen, sin sesión.
rutasValoracionesPrestador.get("/", listarPublicas);
// Solo el rol CLIENTE valora: un prestador nunca escribe (ni borra) en su
// propio perfil, y autorizar() además confirma en la base que la cuenta
// sigue activa. Para escribir, además, el correo confirmado.
rutasValoracionesPrestador.get("/mia", autenticar, autorizar(Rol.CLIENTE), obtenerPropia);
rutasValoracionesPrestador.post("/", autenticar, autorizar(Rol.CLIENTE), exigirCorreoVerificado, crear);

// /prestadores/yo/valoraciones — las que recibió el prestador conectado.
export const rutasValoracionesRecibidas = Router();
rutasValoracionesRecibidas.get("/", autenticar, autorizar(Rol.PRESTADOR), listarRecibidas);

// /valoraciones/:id/objecion — el prestador objeta una valoración que recibió.
export const rutasValoraciones = Router();
rutasValoraciones.post("/:id/objecion", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, crearObjecion);
