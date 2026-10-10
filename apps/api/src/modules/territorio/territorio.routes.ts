import { Router } from "express";
import { comunas } from "./territorio.controller.js";

export const rutasComunas = Router();

rutasComunas.get("/", comunas);
