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
  /**
   * Opcional a propósito: si la API dejara de enviarlo, es preferible no
   * mostrar nada a acusar de "sin verificar" a quien sí lo está.
   */
  correoVerificado?: boolean;
}

interface Sesion {
  accessToken: string;
  usuario: Usuario;
}

export interface Region {
  id: number;
  nombre: string;
  /** Posición de norte a sur, para ordenar los grupos del selector. */
  orden: number;
}

export interface Comuna {
  id: number;
  nombre: string;
  region: Region;
}

export interface PerfilPrestador {
  id: string;
  descripcion: string;
  /** En E.164: "+56912345678". */
  telefono: string;
  radioAtencionKm: number;
  comuna: Comuna;
}

export interface DatosPerfilPrestador {
  descripcion: string;
  telefono: string;
  comunaId: number;
  radioAtencionKm: number;
}

export interface ResumenAdmin {
  totalUsuarios: number;
  porRol: Record<string, number>;
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

  return {
    id: valor.id,
    correo: valor.correo,
    nombre: valor.nombre,
    rol: valor.rol,
    correoVerificado:
      typeof valor.correoVerificado === "boolean" ? valor.correoVerificado : undefined,
  };
}

function leerSesion(valor: unknown): Sesion | null {
  if (!esObjeto(valor) || typeof valor.accessToken !== "string") {
    return null;
  }

  const usuario = leerUsuario(valor.usuario);

  return usuario ? { accessToken: valor.accessToken, usuario } : null;
}

function leerResumen(valor: unknown): ResumenAdmin | null {
  if (!esObjeto(valor) || !esObjeto(valor.resumen)) {
    return null;
  }

  const { totalUsuarios, porRol } = valor.resumen;

  if (typeof totalUsuarios !== "number" || !esObjeto(porRol)) {
    return null;
  }

  const contadores: Record<string, number> = {};

  for (const [rol, total] of Object.entries(porRol)) {
    if (typeof total === "number") {
      contadores[rol] = total;
    }
  }

  return { totalUsuarios, porRol: contadores };
}

function leerComuna(valor: unknown): Comuna | null {
  if (!esObjeto(valor) || typeof valor.id !== "number" || typeof valor.nombre !== "string") {
    return null;
  }

  const region = valor.region;

  if (
    !esObjeto(region) ||
    typeof region.id !== "number" ||
    typeof region.nombre !== "string" ||
    typeof region.orden !== "number"
  ) {
    return null;
  }

  return {
    id: valor.id,
    nombre: valor.nombre,
    region: { id: region.id, nombre: region.nombre, orden: region.orden },
  };
}

function leerPerfilPrestador(valor: unknown): PerfilPrestador | null {
  if (!esObjeto(valor) || !esObjeto(valor.perfil)) {
    return null;
  }

  const { id, descripcion, telefono, radioAtencionKm, comuna } = valor.perfil;
  const comunaLeida = leerComuna(comuna);

  if (
    typeof id !== "string" ||
    typeof descripcion !== "string" ||
    typeof telefono !== "string" ||
    typeof radioAtencionKm !== "number" ||
    !comunaLeida
  ) {
    return null;
  }

  return { id, descripcion, telefono, radioAtencionKm, comuna: comunaLeida };
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

  /**
   * Canjes de enlace ya iniciados, por token.
   *
   * Un token de verificación sirve una sola vez. StrictMode ejecuta los
   * efectos dos veces en desarrollo, así que sin esto la primera llamada
   * consume el enlace y la segunda recibe "ya usado": la persona termina
   * viendo un error aunque su correo sí quedó confirmado. Compartir la
   * promesa por token hace que las dos ejecuciones vean el mismo resultado.
   */
  const canjesEnCurso = new Map<string, Promise<void>>();

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

    async registrarPrestador(datos: {
      nombre: string;
      correo: string;
      contrasena: string;
      rut: string;
    }): Promise<void> {
      await peticion("/auth/registro-prestador", { metodo: "POST", cuerpo: datos });
    },

    async verificarCorreo(token: string): Promise<void> {
      let enCurso = canjesEnCurso.get(token);

      if (!enCurso) {
        // No se limpia al terminar, a diferencia del refresco: el token quedó
        // gastado, así que repetir la petición solo produciría un error.
        enCurso = peticion("/auth/verificar-correo", {
          metodo: "POST",
          cuerpo: { token },
        }).then(() => undefined);

        canjesEnCurso.set(token, enCurso);
      }

      return enCurso;
    },

    async reenviarVerificacion(correo: string): Promise<void> {
      await peticion("/auth/reenviar-verificacion", { metodo: "POST", cuerpo: { correo } });
    },

    async solicitarRecuperacion(correo: string): Promise<void> {
      await peticion("/auth/recuperar", { metodo: "POST", cuerpo: { correo } });
    },

    async restablecerContrasena(token: string, contrasena: string): Promise<void> {
      await peticion("/auth/restablecer", { metodo: "POST", cuerpo: { token, contrasena } });
    },

    async cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Promise<void> {
      await peticion("/auth/cambiar-contrasena", {
        metodo: "POST",
        cuerpo: { contrasenaActual, contrasenaNueva },
        autenticada: true,
      });
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

    /** Lista pública, para el selector. */
    async listarComunas(): Promise<Comuna[]> {
      const cuerpo = await peticion("/comunas");

      if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.comunas)) {
        throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
      }

      return cuerpo.comunas.flatMap((comuna: unknown) => {
        const leida = leerComuna(comuna);
        return leida ? [leida] : [];
      });
    },

    /**
     * El perfil del prestador conectado, o null si todavía no lo crea. El 404
     * no es un error para quien llama: es justamente lo que dice que falta
     * completarlo.
     */
    async obtenerMiPerfilPrestador(): Promise<PerfilPrestador | null> {
      try {
        const perfil = leerPerfilPrestador(await peticion("/prestadores/yo", { autenticada: true }));

        if (!perfil) {
          throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
        }

        return perfil;
      } catch (error) {
        if (error instanceof ErrorApi && error.codigo === "PERFIL_NO_ENCONTRADO") {
          return null;
        }

        throw error;
      }
    },

    async guardarMiPerfilPrestador(datos: DatosPerfilPrestador): Promise<PerfilPrestador> {
      const perfil = leerPerfilPrestador(
        await peticion("/prestadores/yo", { metodo: "PUT", cuerpo: datos, autenticada: true }),
      );

      if (!perfil) {
        throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
      }

      return perfil;
    },

    async obtenerResumenAdmin(): Promise<ResumenAdmin> {
      const resumen = leerResumen(await peticion("/admin/resumen", { autenticada: true }));

      if (!resumen) {
        throw new ErrorApi(500, "RESPUESTA_INESPERADA", MENSAJE_GENERICO, []);
      }

      return resumen;
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
