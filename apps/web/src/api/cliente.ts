export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Error con la forma que devuelve la API: { error: { codigo, mensaje, detalles } }. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: DetalleError[],
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }

  /** Mensaje de validación asociado a un campo, si la API lo envió. */
  mensajeDe(campo: string): string | undefined {
    return this.detalles.find((detalle) => detalle.campo === campo)?.mensaje;
  }
}

export interface Usuario {
  id: string;
  correo: string;
  nombre: string;
  rol: string;
}

interface Sesion {
  accessToken: string;
  usuario: Usuario;
}

interface OpcionesPeticion {
  metodo?: string;
  cuerpo?: unknown;
  /** Solo las peticiones autenticadas llevan Bearer y reintentan tras un 401. */
  autenticada?: boolean;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function leerUsuario(valor: unknown): Usuario | null {
  if (
    !esObjeto(valor) ||
    typeof valor.id !== "string" ||
    typeof valor.correo !== "string" ||
    typeof valor.nombre !== "string" ||
    typeof valor.rol !== "string"
  ) {
    return null;
  }

  return { id: valor.id, correo: valor.correo, nombre: valor.nombre, rol: valor.rol };
}

function leerSesion(valor: unknown): Sesion | null {
  if (!esObjeto(valor) || typeof valor.accessToken !== "string") {
    return null;
  }

  const usuario = leerUsuario(valor.usuario);

  return usuario ? { accessToken: valor.accessToken, usuario } : null;
}

function leerDetalles(valor: unknown): DetalleError[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  return valor.flatMap((entrada: unknown) =>
    esObjeto(entrada) && typeof entrada.campo === "string" && typeof entrada.mensaje === "string"
      ? [{ campo: entrada.campo, mensaje: entrada.mensaje }]
      : [],
  );
}

const MENSAJE_GENERICO = "No fue posible completar la operación. Intenta de nuevo.";

function construirError(estado: number, cuerpo: unknown): ErrorApi {
  if (esObjeto(cuerpo) && esObjeto(cuerpo.error)) {
    const { codigo, mensaje, detalles } = cuerpo.error;

    return new ErrorApi(
      estado,
      typeof codigo === "string" ? codigo : "ERROR_DESCONOCIDO",
      typeof mensaje === "string" ? mensaje : MENSAJE_GENERICO,
      leerDetalles(detalles),
    );
  }

  return new ErrorApi(estado, "ERROR_DESCONOCIDO", MENSAJE_GENERICO, []);
}

export function crearClienteApi() {
  // El token de acceso vive solo en memoria. Nada de localStorage ni
  // sessionStorage: ahí un XSS podría leerlo y además sobreviviría al cierre
  // de la pestaña. Al recargar se recupera la sesión con la cookie httpOnly.
  let tokenAcceso: string | null = null;

  // Promesa del refresco que esté en curso, compartida por todos los que la
  // necesiten. Ver el comentario de refrescar().
  let refrescoEnCurso: Promise<Sesion | null> | null = null;

  async function enviar(ruta: string, opciones: OpcionesPeticion, token: string | null) {
    const cabeceras: Record<string, string> = {};

    if (opciones.cuerpo !== undefined) {
      cabeceras["Content-Type"] = "application/json";
    }

    if (token !== null) {
      cabeceras.Authorization = `Bearer ${token}`;
    }

    return fetch(`/api${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      credentials: "include",
    });
  }

  async function leerCuerpo(respuesta: Response): Promise<unknown> {
    if (respuesta.status === 204) {
      return null;
    }

    try {
      return await respuesta.json();
    } catch {
      return null;
    }
  }

  async function ejecutarRefresco(): Promise<Sesion | null> {
    try {
      const respuesta = await enviar("/auth/refrescar", { metodo: "POST" }, null);

      if (!respuesta.ok) {
        tokenAcceso = null;
        return null;
      }

      const sesion = leerSesion(await leerCuerpo(respuesta));
      tokenAcceso = sesion?.accessToken ?? null;

      return sesion;
    } catch {
      // Un fallo de red no debe propagarse como excepción a cada peticion()
      // que estuviera esperando este mismo refresco.
      tokenAcceso = null;
      return null;
    }
  }

  /**
   * CRÍTICO: nunca puede haber dos refrescos en paralelo.
   *
   * La API rota el token de refresco y trata un token ya rotado como señal de
   * robo: al recibirlo dos veces revoca TODAS las sesiones del usuario. Si dos
   * peticiones recibieran 401 a la vez y cada una refrescara por su cuenta,
   * enviarían la misma cookie dos veces y cerrarían la sesión sin que nadie
   * atacara nada.
   *
   * Por eso la primera llamada crea la promesa y las demás se cuelgan de ella.
   * Esto también cubre el doble efecto de StrictMode en desarrollo.
   */
  function refrescar(): Promise<Sesion | null> {
    refrescoEnCurso ??= ejecutarRefresco().finally(() => {
      refrescoEnCurso = null;
    });

    return refrescoEnCurso;
  }

  async function peticion(ruta: string, opciones: OpcionesPeticion = {}): Promise<unknown> {
    const autenticada = opciones.autenticada ?? false;
    let respuesta = await enviar(ruta, opciones, autenticada ? tokenAcceso : null);

    // Un único reintento: si el token de acceso venció, se refresca una vez y
    // se repite la petición. No hay bucle, así que un 401 persistente falla.
    if (autenticada && respuesta.status === 401) {
      const sesion = await refrescar();

      if (sesion) {
        respuesta = await enviar(ruta, opciones, sesion.accessToken);
      }
    }

    const cuerpo = await leerCuerpo(respuesta);

    if (!respuesta.ok) {
      throw construirError(respuesta.status, cuerpo);
    }

    return cuerpo;
  }

  return {
    async registrar(datos: { nombre: string; correo: string; contrasena: string }): Promise<void> {
      await peticion("/auth/registro", { metodo: "POST", cuerpo: datos });
    },

    async iniciarSesion(correo: string, contrasena: string): Promise<Usuario> {
      const sesion = leerSesion(
        await peticion("/auth/login", { metodo: "POST", cuerpo: { correo, contrasena } }),
      );

      if (!sesion) {
        throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
      }

      tokenAcceso = sesion.accessToken;

      return sesion.usuario;
    },

    /** Al arrancar la app: la cookie httpOnly es lo único que sobrevive a una recarga. */
    async restaurarSesion(): Promise<Usuario | null> {
      const sesion = await refrescar();

      return sesion?.usuario ?? null;
    },

    async obtenerPerfil(): Promise<Usuario> {
      const cuerpo = await peticion("/auth/yo", { autenticada: true });
      const usuario = esObjeto(cuerpo) ? leerUsuario(cuerpo.usuario) : null;

      if (!usuario) {
        throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
      }

      return usuario;
    },

    async cerrarSesion(): Promise<void> {
      try {
        await peticion("/auth/logout", { metodo: "POST" });
      } finally {
        // Aunque la llamada falle, en el navegador la sesión queda cerrada.
        tokenAcceso = null;
      }
    },
  };
}

export type ClienteApi = ReturnType<typeof crearClienteApi>;

/** Instancia única de la aplicación. Las pruebas crean la suya con crearClienteApi(). */
export const clienteApi = crearClienteApi();
