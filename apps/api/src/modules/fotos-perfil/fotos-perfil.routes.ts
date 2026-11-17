import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { recibirImagen } from "../imagenes/imagenes.routes.js";
import { desestimarAdmin, listarAdmin, obtenerMia, quitar, reportar, retirarAdmin, subir } from "./fotos-perfil.controller.js";

// /cuenta/foto — la foto de la propia cuenta, para cualquier rol.
export const rutasMiFoto = Router();

rutasMiFoto.get("/", autenticar, obtenerMia);
// Subir o cambiar exige el correo confirmado: la foto es pública desde ya.
// autenticar y exigirCorreoVerificado van antes que multer: sin sesión no se lee un byte.
rutasMiFoto.put("/", autenticar, exigirCorreoVerificado, recibirImagen, subir);
rutasMiFoto.delete("/", autenticar, quitar);

// /fotos-perfil/:id/reportes — cualquier rol con sesión y correo confirmado.
export const rutasFotosPerfil = Router();

rutasFotosPerfil.post("/:id/reportes", autenticar, exigirCorreoVerificado, reportar);

// /admin/fotos-perfil — solo administradores, y solo las fotos reportadas.
export const rutasFotosPerfilAdmin = Router();

rutasFotosPerfilAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasFotosPerfilAdmin.get("/", listarAdmin);
rutasFotosPerfilAdmin.patch("/:id/retirar", retirarAdmin);
rutasFotosPerfilAdmin.patch("/:id/desestimar", desestimarAdmin);
