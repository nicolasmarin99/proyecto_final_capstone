import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { crear, crearObjecion, listarDePrestador, listarDeServicio, listarRecibidas, obtenerPropia } from "./valoraciones.controller.js";

/*
  Ninguna ruta de este archivo edita, oculta ni borra una valoración. El
  cliente publica la suya una sola vez y queda definitiva (no hay PUT,
  PATCH ni DELETE); el prestador solo objeta; ocultar es una decisión del
  administrador en /admin/reportes (reportes.routes.ts).
*/

// /servicios/:id/valoraciones — se monta dentro de las rutas de servicios.
// Cada valoración califica UN servicio, el que el cliente contactó.
export const rutasValoracionesServicio = Router({ mergeParams: true });

// Pública: la lista y el resumen de ese servicio, sin sesión.
rutasValoracionesServicio.get("/", listarDeServicio);
// Solo el rol CLIENTE valora: un prestador nunca escribe (ni borra) en sus
// propios servicios, y autorizar() además confirma en la base que la cuenta
// sigue activa. Para escribir, además, el correo confirmado.
rutasValoracionesServicio.get("/mia", autenticar, autorizar(Rol.CLIENTE), obtenerPropia);
rutasValoracionesServicio.post("/", autenticar, autorizar(Rol.CLIENTE), exigirCorreoVerificado, crear);

// /prestadores/:id/valoraciones — pública: todas las de sus servicios, con
// el promedio general, para su perfil. Aquí no se valora: se valora un servicio.
export const rutasValoracionesPrestador = Router({ mergeParams: true });
rutasValoracionesPrestador.get("/", listarDePrestador);

// /prestadores/yo/valoraciones — las que recibió el prestador conectado.
export const rutasValoracionesRecibidas = Router();
rutasValoracionesRecibidas.get("/", autenticar, autorizar(Rol.PRESTADOR), listarRecibidas);

// /valoraciones/:id/objecion — el prestador objeta una valoración que recibió.
export const rutasValoraciones = Router();
rutasValoraciones.post("/:id/objecion", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, crearObjecion);
