import { Router } from "express";
import { autenticarSinExigirTerminos } from "../../middlewares/autenticar.js";
import { aceptarVigente, obtenerVigente } from "./terminos.controller.js";

export const rutasTerminos = Router();

// Público: se lee antes de crear la cuenta.
rutasTerminos.get("/vigente", obtenerVigente);
// Con sesión, pero SIN exigir los términos: es justamente la ruta para aceptarlos.
rutasTerminos.post("/aceptar", autenticarSinExigirTerminos, aceptarVigente);
