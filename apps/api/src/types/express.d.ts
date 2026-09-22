import type { Rol } from "../generated/prisma/client.js";

// Extensión de tipos de Express: permite que los controladores lean
// req.usuario con tipos concretos, sin recurrir a any ni a aserciones.
declare global {
  namespace Express {
    interface Request {
      /** Lo deja el middleware autenticar después de validar el token. */
      usuario?: { id: string; rol: Rol };
    }
  }
}

export {};
