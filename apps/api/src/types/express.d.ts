import type { Rol } from "../generated/prisma/client.js";

// Extensión de tipos de Express: permite que los controladores lean
// req.usuario con tipos concretos, sin recurrir a any ni a aserciones.
declare global {
  namespace Express {
    interface Request {
      /** Lo que afirma el token. Lo deja autenticar tras validar la firma. */
      usuario?: { id: string; rol: Rol };
      /**
       * La fila real del usuario, leída de la base durante la autorización.
       * Se guarda aquí para que una misma petición no consulte dos veces.
       */
      cuenta?: { id: string; rol: Rol; activo: boolean };
    }
  }
}

export {};
