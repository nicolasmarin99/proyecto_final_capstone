import { useCallback, useEffect, useId, useState } from "react";
import { LARGO_MAXIMO_MOTIVO_DECISION, LARGO_MINIMO_MOTIVO_DECISION } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type FotoReportada } from "../api/cliente";
import { MOTIVO_REPORTE_FOTO } from "../servicios/reportes";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { NOMBRE_ROL } from "./MenuUsuario";
import { Titulo } from "./Titulo";

const fechaCorta = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

type Accion = "retirar" | "desestimar";

/** Una foto reportada: la foto, de quién es, los reportes y las dos decisiones posibles. */
function FotoParaDecidir({ foto, cliente, alDecidir }: { foto: FotoReportada; cliente: ClienteApi; alDecidir(mensaje: string): void }) {
  const idMotivo = useId();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  async function decidir() {
    if (!accion) return;
    const limpio = motivo.trim();
    if (limpio.length < LARGO_MINIMO_MOTIVO_DECISION) {
      setError(`Explica la decisión en al menos ${LARGO_MINIMO_MOTIVO_DECISION} caracteres.`);
      return;
    }
    setEnviando(true);
    setError(undefined);
    try {
      await cliente.decidirFotoPerfil(foto.id, accion, limpio);
      alDecidir(
        accion === "retirar"
          ? `Se retiró la foto de ${foto.cuenta.nombre}.`
          : `Los reportes de la foto de ${foto.cuenta.nombre} quedaron desestimados.`,
      );
    } catch (causa) {
      setError(causa instanceof ErrorApi ? (causa.mensajeDe("motivo") ?? causa.message) : "No fue posible registrar la decisión.");
      setEnviando(false);
    }
  }

  return (
    <li className="rounded-medio border border-borde bg-blanco p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <a
          href={foto.url}
          target="_blank"
          rel="noreferrer"
          className="block shrink-0 self-start rounded-chico focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
        >
          <img src={foto.url} alt={`Foto de perfil de ${foto.cuenta.nombre}, abrir en tamaño completo`} className="size-32 rounded-chico bg-niebla object-cover" />
        </a>
        <div className="min-w-0 flex-1">
          <Titulo profundidad={1} className="font-semibold break-words text-noche">
            {foto.cuenta.nombre} <span className="font-normal text-texto-suave">· {NOMBRE_ROL[foto.cuenta.rol] ?? foto.cuenta.rol}</span>
          </Titulo>
          <p className="mt-0.5 text-xs text-texto-suave">
            Subida el {fechaCorta.format(new Date(foto.subidaEn))} ·{" "}
            {foto.personas === 1 ? "1 persona la reportó" : `${foto.personas} personas la reportaron`}
          </p>
          {foto.retiradasAntes > 0 && (
            <p className="mt-2 inline-block rounded-full bg-alerta-50 px-2.5 py-0.5 text-xs font-semibold text-alerta-700">
              {foto.retiradasAntes === 1 ? "Ya se le retiró 1 foto antes" : `Ya se le retiraron ${foto.retiradasAntes} fotos antes`}
            </p>
          )}
          <ul aria-label="Reportes" className="mt-3 space-y-2">
            {foto.reportes.map((reporte) => (
              <li key={reporte.id} className="rounded-chico bg-niebla px-3 py-2 text-sm">
                <p className="font-semibold text-noche">{MOTIVO_REPORTE_FOTO[reporte.motivo].texto}</p>
                {reporte.comentario && <p className="mt-0.5 break-words text-noche">{reporte.comentario}</p>}
                <p className="mt-0.5 text-xs text-texto-suave">
                  {fechaCorta.format(new Date(reporte.enviadoEn))}
                  {reporte.cuentaConMasDeUnaSemana ? "" : " · cuenta con menos de una semana"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {accion === null ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Boton type="button" variante="secundario" onClick={() => setAccion("desestimar")}>
            Desestimar reportes
          </Boton>
          <Boton type="button" onClick={() => setAccion("retirar")}>
            Retirar foto
          </Boton>
        </div>
      ) : (
        <div className={`mt-4 rounded-medio border p-3 ${accion === "retirar" ? "border-error-700/20 bg-error-50" : "border-borde bg-niebla"}`}>
          <p className="text-sm text-noche">
            {accion === "retirar"
              ? "La foto se borra de internet y deja de verse en todo LocalCL. No se puede deshacer; la persona podrá subir otra."
              : "La foto sigue publicada y los reportes se cierran."}
          </p>
          <CampoAreaTexto
            id={idMotivo}
            etiqueta={accion === "retirar" ? "Motivo (lo verá la persona)" : "Motivo de la decisión"}
            valor={motivo}
            alCambiar={(valor) => {
              setMotivo(valor);
              setError(undefined);
            }}
            minimo={LARGO_MINIMO_MOTIVO_DECISION}
            maximo={LARGO_MAXIMO_MOTIVO_DECISION}
            error={error}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton type="button" variante="secundario" disabled={enviando} onClick={() => setAccion(null)}>
              Cancelar
            </Boton>
            <Boton type="button" cargando={enviando} onClick={() => void decidir()}>
              {accion === "retirar" ? "Retirar foto" : "Desestimar reportes"}
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Las fotos de perfil REPORTADAS que esperan una decisión: lo único que el
 * panel muestra de las fotos de perfil (se publican sin revisión previa).
 * De quien reportó no se muestra nada salvo si su cuenta es muy nueva.
 */
export function FotosReportadas({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [fotos, setFotos] = useState<FotoReportada[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(
    async (numero: number) => {
      setCargando(true);
      setError(null);
      try {
        const datos = await cliente.fotosPerfilReportadas(numero);
        setFotos((actuales) => (numero === 1 ? datos.fotos : [...actuales, ...datos.fotos]));
        setTotal(datos.total);
        setPagina(numero);
      } catch {
        setError("No fue posible cargar las fotos reportadas.");
      } finally {
        setCargando(false);
      }
    },
    [cliente],
  );

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <Titulo profundidad={0} id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Fotos de perfil reportadas{total > 0 ? ` (${total})` : ""}
      </Titulo>
      <p className="mt-1 text-sm text-texto-suave">
        Las fotos de perfil se publican al subirlas. Aquí aparecen solo las que alguien reportó.
      </p>

      <p role="status" className={aviso ? "mt-3 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700" : "sr-only"}>
        {aviso}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {!cargando && !error && fotos.length === 0 && <p className="mt-4 text-sm text-texto-suave">No hay fotos de perfil reportadas.</p>}

      {fotos.length > 0 && (
        <ul className="mt-4 space-y-4">
          {fotos.map((foto) => (
            <FotoParaDecidir
              key={foto.id}
              foto={foto}
              cliente={cliente}
              alDecidir={(mensaje) => {
                // Decidida: sale de la lista, que solo muestra lo pendiente.
                setFotos((actuales) => actuales.filter((otra) => otra.id !== foto.id));
                setTotal((actual) => Math.max(0, actual - 1));
                setAviso(mensaje);
              }}
            />
          ))}
        </ul>
      )}

      {cargando && <p className="mt-4 text-sm text-texto-suave">Cargando fotos reportadas…</p>}

      {!cargando && fotos.length < total && (
        <Boton type="button" variante="secundario" className="mt-4" onClick={() => void cargar(pagina + 1)}>
          Ver más fotos
        </Boton>
      )}
    </section>
  );
}
