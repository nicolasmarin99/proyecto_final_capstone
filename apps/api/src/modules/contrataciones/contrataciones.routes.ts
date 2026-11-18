import { Router } from "express";
import { Rol } from "../../generated/prisma/client.js";
import { autenticar } from "../../middlewares/autenticar.js";
import { autorizar } from "../auth/auth.autorizar.js";
import { actualizar, borrar, crear, enServicio, listar } from "./contrataciones.controller.js";

/*
  /contrataciones — el historial PRIVADO de servicios contratados.

  Son TODAS las rutas que existen sobre este registro, y todas hablan solo
  de las filas de quien tiene la sesión: ninguna recibe un id de usuario,
  ni lista por servicio o prestador para otra persona. No existe una ruta
  bajo /prestadores ni /admin que las muestre.

  Registra quien contrató: un cliente, o un prestador que contrató a OTRO
  prestador (igual que al valorar). autorizar() además confirma en la base
  que la cuenta sigue activa; un administrador no tiene historial que llevar.
*/
export const rutasContrataciones = Router();

const propias = [autenticar, autorizar(Rol.CLIENTE, Rol.PRESTADOR)];

rutasContrataciones.get("/", ...propias, listar);
rutasContrataciones.post("/", ...propias, crear);
// Para la página de un servicio: si puede registrarlo y lo que ya registró de él.
rutasContrataciones.get("/servicio/:servicioId", ...propias, enServicio);
rutasContrataciones.patch("/:id", ...propias, actualizar);
rutasContrataciones.delete("/:id", ...propias, borrar);
