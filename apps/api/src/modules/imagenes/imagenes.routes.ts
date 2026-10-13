import { TAMANO_MAXIMO_IMAGEN } from "@localcl/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { ErrorHttp } from "../../shared/errores.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { eliminar, listarAdmin, ocultarAdmin, ordenar, soloDuenoDelServicio, subir } from "./imagenes.controller.js";

const leerImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_IMAGEN, files: 1, fields: 0 },
}).single("imagen");

const MENSAJES_MULTER: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: `La imagen supera los ${TAMANO_MAXIMO_IMAGEN / (1024 * 1024)} MB.`,
  LIMIT_FILE_COUNT: "Sube una imagen a la vez.",
  LIMIT_UNEXPECTED_FILE: "Adjunta la imagen en el campo «imagen».",
};

/**
 * multer en memoria: la foto nunca toca el disco del servidor sin limpiar.
 * Sus errores se traducen acá, colgados del campo «imagen», para no cambiar
 * cómo el manejador central responde los del documento de identidad.
 */
function recibirImagen(req: Request, res: Response, next: NextFunction) {
  leerImagen(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        new ErrorHttp(400, "DATOS_INVALIDOS", "Los datos enviados no son válidos.", [
          { campo: "imagen", mensaje: MENSAJES_MULTER[error.code] ?? "No se pudo recibir la imagen." },
        ]),
      );
      return;
    }
    next(error);
  });
}

/** Escribir exige ser prestador con el correo confirmado; ser el dueño lo revisa cada paso. */
const prestadorVerificado = [autenticar, autorizar(Rol.PRESTADOR), exigirCorreoVerificado];

// /servicios/:id/imagenes — se monta dentro de las rutas de servicios.
export const rutasImagenesServicio = Router({ mergeParams: true });

// El orden importa: quien no es el dueño recibe 403 antes de que multer lea un byte.
rutasImagenesServicio.post("/", ...prestadorVerificado, soloDuenoDelServicio, recibirImagen, subir);
// /orden antes que /:imagenId, por claridad: son métodos distintos, pero así se lee.
rutasImagenesServicio.put("/orden", ...prestadorVerificado, ordenar);
rutasImagenesServicio.delete("/:imagenId", ...prestadorVerificado, eliminar);

// /admin/imagenes
export const rutasImagenesAdmin = Router();

rutasImagenesAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasImagenesAdmin.get("/", listarAdmin);
rutasImagenesAdmin.patch("/:id/ocultar", ocultarAdmin);
