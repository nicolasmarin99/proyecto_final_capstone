import { TAMANO_MAXIMO_DOCUMENTO } from "@localcl/shared";
import { Router } from "express";
import multer from "multer";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import {
  aprobarCertificacion,
  documento,
  listarCola,
  listarPropias,
  listarTipos,
  rechazarCertificacion,
  subir,
} from "./certificaciones.controller.js";

/**
 * multer en memoria, como la cédula: el archivo nunca toca el disco del
 * servidor. Un solo archivo («documento») y los pocos campos del formulario.
 */
const recibirCertificacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO, files: 1, fields: 6, fieldSize: 1024 },
}).single("documento");

// /certificaciones/tipos — el catálogo del formulario. Público: no dice nada de nadie.
export const rutasCatalogoCertificaciones = Router();
rutasCatalogoCertificaciones.get("/tipos", listarTipos);

// /prestadores/yo/certificaciones
export const rutasCertificacionesPrestador = Router();

// El orden importa: quien no es un prestador con correo verificado recibe
// 401/403 antes de que multer lea un solo byte del archivo.
rutasCertificacionesPrestador.post("/", autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado, recibirCertificacion, subir);
rutasCertificacionesPrestador.get("/", autenticar, autorizar(Rol.PRESTADOR), listarPropias);

// /admin/certificaciones
export const rutasCertificacionesAdmin = Router();

rutasCertificacionesAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasCertificacionesAdmin.get("/", listarCola);
rutasCertificacionesAdmin.get("/:id/documento", documento);
rutasCertificacionesAdmin.patch("/:id/aprobar", aprobarCertificacion);
rutasCertificacionesAdmin.patch("/:id/rechazar", rechazarCertificacion);
