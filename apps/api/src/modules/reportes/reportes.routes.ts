import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { exigirCorreoVerificado } from "../auth/auth.exigirCorreoVerificado.js";
import { crear, desestimar, listarCola, obtenerPropio, ocultar, retirarPropio, verDetalle } from "./reportes.controller.js";

// /servicios/:id/reportes — se monta dentro de las rutas de servicios.
// Cualquier rol con sesión y correo confirmado puede reportar; las reglas
// por rol (no reportar lo propio ni la propia categoría) las aplica el servicio.
export const rutasReportesServicio = Router({ mergeParams: true });

rutasReportesServicio.post("/", autenticar, exigirCorreoVerificado, crear);
rutasReportesServicio.get("/mio", autenticar, obtenerPropio);
rutasReportesServicio.delete("/mio", autenticar, retirarPropio);

// /admin/reportes — solo administradores.
export const rutasReportesAdmin = Router();

rutasReportesAdmin.use(autenticar, autorizar(Rol.ADMINISTRADOR));
rutasReportesAdmin.get("/", listarCola);
rutasReportesAdmin.get("/:servicioId", verDetalle);
rutasReportesAdmin.patch("/:servicioId/desestimar", desestimar);
rutasReportesAdmin.patch("/:servicioId/ocultar", ocultar);
