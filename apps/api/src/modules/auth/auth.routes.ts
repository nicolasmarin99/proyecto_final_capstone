import { Router } from "express";
import { autenticar } from "../../middlewares/autenticar.js";
import { login, logout, refrescar, registrar, yo } from "./auth.controller.js";

export const rutasAuth = Router();

rutasAuth.post("/registro", registrar);
rutasAuth.post("/login", login);
rutasAuth.get("/yo", autenticar, yo);
rutasAuth.post("/refrescar", refrescar);
rutasAuth.post("/logout", logout);
