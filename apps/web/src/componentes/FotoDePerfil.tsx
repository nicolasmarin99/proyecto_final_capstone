import { useEffect, useId, useState, type ChangeEvent } from "react";
import { TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN_PERMITIDOS } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type MiFoto } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Avatar } from "./Avatar";
import { Icono } from "./iconos";

const MEGAS = TAMANO_MAXIMO_IMAGEN / (1024 * 1024);
const TIPOS: readonly string[] = TIPOS_IMAGEN_PERMITIDOS;
const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

/** Revisión en el navegador para avisar antes de subir. La que manda es la de la API, por los bytes. */
function problemaDe(archivo: File): string | null {
  if (!TIPOS.includes(archivo.type)) return "La foto debe ser una imagen JPG, PNG o WEBP.";
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) return `La foto supera los ${MEGAS} MB.`;
  return null;
}

const clasesAccion =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-boton border border-borde-fuerte bg-blanco px-4 text-sm font-bold text-primario transition-colors hover:bg-hielo";

/**
 * La foto de perfil de la propia cuenta, en «Mi perfil». Para cualquier rol.
 *
 * Se publica al subirla: no hay revisión previa. Si un administrador la
 * retiró tras un reporte, se explica por qué y se puede subir otra.
 */
export function FotoDePerfil({ cliente, nombre, correoVerificado }: { cliente: ClienteApi; nombre: string; correoVerificado: boolean }) {
  const { actualizarFoto } = useAuth();
  const idTitulo = useId();
  const idEntrada = useId();
  const idAyuda = useId();
  const [mia, setMia] = useState<MiFoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"subiendo" | "quitando" | null>(null);

  useEffect(() => {
    let cancelado = false;
    cliente
      .obtenerMiFoto()
      .then((datos) => {
        if (!cancelado) setMia(datos);
      })
      .catch(() => {
        if (!cancelado) setMia({ foto: null, retirada: null });
      });
    return () => {
      cancelado = true;
    };
  }, [cliente]);

  async function elegir(evento: ChangeEvent<HTMLInputElement>) {
    const [archivo] = Array.from(evento.target.files ?? []);
    // Se limpia para que elegir el mismo archivo otra vez vuelva a disparar el cambio.
    evento.target.value = "";
    if (!archivo) return;
    setAviso(null);
    const problema = problemaDe(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setOcupado("subiendo");
    try {
      const foto = await cliente.subirFotoPerfil(archivo);
      setMia({ foto, retirada: null });
      actualizarFoto(foto);
      setAviso("Listo: tu foto ya se ve en tu perfil.");
    } catch (causa) {
      setError(causa instanceof ErrorApi ? (causa.mensajeDe("imagen") ?? causa.message) : "No fue posible subir la foto. Intenta de nuevo.");
    } finally {
      setOcupado(null);
    }
  }

  async function quitar() {
    setError(null);
    setAviso(null);
    setOcupado("quitando");
    try {
      await cliente.quitarFotoPerfil();
      setMia({ foto: null, retirada: null });
      actualizarFoto(null);
      setAviso("Quitaste tu foto.");
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : "No fue posible quitar la foto. Intenta de nuevo.");
    } finally {
      setOcupado(null);
    }
  }

  const foto = mia?.foto ?? null;

  return (
    <section aria-labelledby={idTitulo} className="mb-6 rounded-medio border border-borde p-4 sm:p-5">
      <h2 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        Tu foto de perfil
      </h2>

      {mia?.retirada && (
        <div className="mt-3 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
          <p className="font-semibold">Retiramos tu foto anterior el {fecha.format(new Date(mia.retirada.retiradaEn))}</p>
          {mia.retirada.motivo && <p className="mt-1 break-words">Motivo: {mia.retirada.motivo}</p>}
          <p className="mt-1">Puedes subir otra que cumpla las reglas.</p>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar nombre={nombre} foto={foto} tamano="grande" />
        <div className="min-w-0">
          <p id={idAyuda} className="text-sm text-texto-suave">
            {foto ? "Se ve en tu perfil y junto a tus valoraciones. " : "Aún no tienes foto. "}
            JPG, PNG o WEBP, hasta {MEGAS} MB. Quitamos la ubicación y los datos de la cámara antes de publicarla.
          </p>
          {!correoVerificado ? (
            <p className="mt-2 text-sm font-medium text-noche">Confirma tu correo para poder subir una foto.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                id={idEntrada}
                type="file"
                accept={TIPOS_IMAGEN_PERMITIDOS.join(",")}
                disabled={ocupado !== null || mia === null}
                onChange={(evento) => void elegir(evento)}
                aria-describedby={idAyuda}
                className="peer sr-only"
              />
              <label
                htmlFor={idEntrada}
                className={`${clasesAccion} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primario peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
              >
                <Icono nombre="imagen" tamano={18} />
                {ocupado === "subiendo" ? "Subiendo…" : foto ? "Cambiar foto" : "Subir foto"}
              </label>
              {foto && (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => void quitar()}
                  className={`${clasesAccion} text-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {ocupado === "quitando" ? "Quitando…" : "Quitar foto"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
      <p role="status" className={aviso ? "mt-3 text-sm font-medium text-exito-700" : "sr-only"}>
        {aviso}
      </p>
    </section>
  );
}
