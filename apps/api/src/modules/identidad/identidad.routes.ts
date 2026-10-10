import { TAMANO_MAXIMO_DOCUMENTO } from "@localcl/shared";
import { Router } from "express";
import multer from "multer";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { aprobar, cola, documento, estadoPropio, rechazar, subirDocumento } from "./identidad.controller.js";

/**
 * multer en memoria: el archivo nunca toca el disco del servidor, así que no
 * queda una copia temporal de la cédula que haya que acordarse de borrar. El
 * límite corta la lectura al pasar los 5 MB, sin esperar a recibir el resto.
 * Un solo archivo y ningún campo de texto: no hay nada más que aceptar.
 */
const recibirDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO, files: 1, fields: 0 },
}).single("documento");

// /prestadores/yo/identidad
export const rutasIdentidadPrestador = Router();

// El orden importa: quien no es un prestador con correo verificado recibe
// 401/403 antes de que multer lea un solo byte del archivo.
rutasIdentidadPrestador.post(
  "/",
  autenticar,
  autorizar(Rol.PRESTADOR),
  exigirCorreoVerificado,
  recibirDocumento,
  subirDocumento,
);
rutasIdentidadPrestador.get("/", autenticar, autorizar(Rol.PRESTADOR), estadoPropio);

// /admin/identidades
export const rutasIdentidadAdmin = Router();

rutasIdentidadAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasIdentidadAdmin.get("/", cola);
rutasIdentidadAdmin.get("/:id/documento", documento);
rutasIdentidadAdmin.patch("/:id/aprobar", aprobar);
rutasIdentidadAdmin.patch("/:id/rechazar", rechazar);
