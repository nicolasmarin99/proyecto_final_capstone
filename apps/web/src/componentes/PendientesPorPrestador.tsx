import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ClienteApi, ConteoPendientes, PrestadorConPendientes } from "../api/cliente";
import { Boton } from "./Boton";
import { ColaCertificaciones } from "./ColaCertificaciones";
import { ColaIdentidades } from "./ColaIdentidades";
import { ColaReportes } from "./ColaReportes";
import { Icono } from "./iconos";
import { ModeracionImagenes } from "./ModeracionImagenes";
import { ConNivelDeTitulo, Titulo } from "./Titulo";

/** «1 certificación», «3 certificaciones». */
function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

/** Lo que tiene por revisar, en palabras: «Verificación de identidad · 2 certificaciones · 3 imágenes». */
export function resumenDePendientes(pendientes: ConteoPendientes): string[] {
  const partes: string[] = [];
  if (pendientes.identidad > 0) partes.push("Verificación de identidad");
  if (pendientes.certificaciones > 0) partes.push(contar(pendientes.certificaciones, "certificación", "certificaciones"));
  if (pendientes.cursos > 0) partes.push(contar(pendientes.cursos, "curso", "cursos"));
  if (pendientes.reportes > 0) partes.push(contar(pendientes.reportes, "reporte", "reportes"));
  if (pendientes.imagenes > 0) partes.push(contar(pendientes.imagenes, "imagen", "imágenes"));
  return partes;
}

/** «hace 3 horas», «hace 2 días». */
function textoEspera(desde: string): string | null {
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  const minutos = Math.max(0, Math.floor((Date.now() - inicio) / 60_000));
  if (minutos < 60) return minutos <= 1 ? "hace un momento" : `hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Qué colas se muestran al desplegar un prestador. */
interface Secciones {
  reportes: boolean;
  identidad: boolean;
  certificaciones: boolean;
  imagenes: boolean;
}

function seccionesDe(pendientes: ConteoPendientes): Secciones {
  return {
    reportes: pendientes.reportes > 0,
    identidad: pendientes.identidad > 0,
    certificaciones: pendientes.certificaciones + pendientes.cursos > 0,
    imagenes: pendientes.imagenes > 0,
  };
}

const SIN_PENDIENTES: ConteoPendientes = { identidad: 0, certificaciones: 0, cursos: 0, reportes: 0, imagenes: 0 };

/** Un prestador: su nombre, lo que tiene por revisar y, al abrirlo, las colas con lo suyo. */
function FilaPrestador({
  prestador,
  abierto,
  secciones,
  cliente,
  alAlternar,
  alCambiar,
}: {
  prestador: PrestadorConPendientes;
  abierto: boolean;
  /** Las colas que se muestran: las que tenía al abrirlo, aunque ya se hayan vaciado. */
  secciones: Secciones;
  cliente: ClienteApi;
  alAlternar(): void;
  alCambiar(): void;
}) {
  const idPanel = useId();
  const idNombre = useId();
  const partes = resumenDePendientes(prestador.pendientes);
  const espera = prestador.total > 0 ? textoEspera(prestador.esperandoDesde) : null;

  return (
    <li className={`rounded-medio border bg-blanco transition-colors ${abierto ? "border-primario" : "border-borde"}`}>
      {/* El título contiene el botón: es el patrón de acordeón, y el lector de pantalla anuncia nombre y estado. */}
      <Titulo profundidad={1} className="m-0">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={idPanel}
          onClick={alAlternar}
          className="flex w-full cursor-pointer items-center gap-3 rounded-medio p-4 text-left hover:bg-niebla focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
        >
          <span className="min-w-0 flex-1">
            <span id={idNombre} className="block font-titulos text-base font-bold break-words text-noche">
              {prestador.nombre}
            </span>
            <span className="mt-0.5 block text-sm font-normal text-texto-suave">
              {partes.length > 0 ? `Por revisar: ${partes.join(" · ")}` : "Sin pendientes: ya revisaste todo lo suyo."}
            </span>
            {espera && <span className="mt-0.5 block text-xs font-normal text-texto-suave">Esperando {espera}</span>}
          </span>
          {prestador.total > 0 ? (
            <span
              aria-hidden="true"
              className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primario px-2 text-xs font-bold text-blanco"
            >
              {prestador.total}
            </span>
          ) : (
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-exito-50 text-exito-700">
              <Icono nombre="visto" tamano={16} grosor={2.4} />
            </span>
          )}
          <span aria-hidden="true" className={`shrink-0 text-texto-suave motion-safe:transition-transform ${abierto ? "rotate-180" : ""}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>
      </Titulo>

      {abierto && (
        <div id={idPanel} role="region" aria-labelledby={idNombre} className="border-t border-borde px-4 pb-5">
          {/* Dentro del prestador, los títulos de las colas parten un nivel más abajo que su nombre. */}
          <ConNivelDeTitulo nivel={4}>
            {secciones.reportes && <ColaReportes cliente={cliente} prestadorId={prestador.id} alCambiar={alCambiar} />}
            {secciones.identidad && <ColaIdentidades cliente={cliente} prestadorId={prestador.id} alCambiar={alCambiar} />}
            {secciones.certificaciones && <ColaCertificaciones cliente={cliente} prestadorId={prestador.id} alCambiar={alCambiar} />}
            {secciones.imagenes && <ModeracionImagenes cliente={cliente} prestadorId={prestador.id} alCambiar={alCambiar} />}
          </ConNivelDeTitulo>
        </div>
      )}
    </li>
  );
}

/**
 * El panel organizado por prestador: cada prestador que envió algo por
 * revisar aparece UNA vez, con un resumen de lo que tiene pendiente
 * (identidad, certificaciones, cursos, reportes, imágenes). Al abrirlo se
 * despliegan las colas con solo lo suyo.
 *
 * Los conteos vienen de GET /admin/pendientes; cada cola desplegada pide lo
 * suyo con ?prestador=. Al resolver algo, la lista se vuelve a pedir para
 * que los números estén al día. El prestador abierto no desaparece mientras
 * se trabaja en él, aunque quede sin pendientes: así se alcanza a leer la
 * confirmación de lo último que se decidió.
 */
export function PendientesPorPrestador({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  const [pagina, setPagina] = useState(1);
  const [prestadores, setPrestadores] = useState<PrestadorConPendientes[] | null>(null);
  const [total, setTotal] = useState(0);
  const [porPagina, setPorPagina] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; secciones: Secciones } | null>(null);
  // cargar() necesita saber cuál está abierto cuando LLEGA la respuesta, no
  // cuando se creó la función: por eso una referencia y no una dependencia.
  const idAbierto = useRef<string | null>(null);
  useEffect(() => {
    idAbierto.current = abierto?.id ?? null;
  }, [abierto]);

  const cargar = useCallback(
    async (numero: number) => {
      setError(null);
      try {
        const datos = await cliente.pendientesPorPrestador(numero);
        setTotal(datos.total);
        setPorPagina(datos.porPagina);
        setPrestadores((actuales) => {
          // El que está abierto se conserva en la lista aunque ya no tenga pendientes.
          const id = idAbierto.current;
          if (!id || datos.prestadores.some((prestador) => prestador.id === id)) return datos.prestadores;
          const anterior = (actuales ?? []).find((prestador) => prestador.id === id);
          return anterior ? [{ ...anterior, pendientes: SIN_PENDIENTES, total: 0 }, ...datos.prestadores] : datos.prestadores;
        });
      } catch {
        setError("No fue posible cargar los pendientes.");
      }
    },
    [cliente],
  );

  useEffect(() => {
    void cargar(pagina);
  }, [cargar, pagina]);

  function alternar(prestador: PrestadorConPendientes) {
    if (abierto?.id === prestador.id) {
      setAbierto(null);
      // Al cerrarlo, si ya no tenía nada pendiente, sale de la lista.
      setPrestadores((actuales) => (actuales ?? []).filter((otro) => otro.id !== prestador.id || otro.total > 0));
      return;
    }
    // Al abrir otro, el anterior también sale si quedó sin pendientes.
    setPrestadores((actuales) => (actuales ?? []).filter((otro) => otro.id === prestador.id || otro.total > 0));
    setAbierto({ id: prestador.id, secciones: seccionesDe(prestador.pendientes) });
  }

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <Titulo id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Pendientes por prestador
      </Titulo>
      <p className="mt-1 text-sm text-texto-suave">
        Cada prestador aparece una vez, con todo lo que envió y espera revisión. Ábrelo para revisar lo suyo. Primero, quien
        lleva más tiempo esperando.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-chico border border-error-700/20 bg-error-50 px-4 py-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {!error && prestadores === null && <p className="mt-4 text-sm text-texto-suave">Cargando los pendientes…</p>}

      {/* role=status: el lector de pantalla anuncia cuántos quedan después de cada decisión. */}
      <p role="status" className={prestadores === null ? "sr-only" : "mt-4 text-sm font-medium text-texto-suave"}>
        {prestadores === null
          ? ""
          : total === 0
            ? "No hay nada pendiente de revisión."
            : total === 1
              ? "1 prestador con pendientes"
              : `${total} prestadores con pendientes`}
      </p>

      {prestadores && prestadores.length > 0 && (
        <ul aria-label="Prestadores con pendientes" className="mt-3 space-y-3">
          {prestadores.map((prestador) => (
            <FilaPrestador
              key={prestador.id}
              prestador={prestador}
              abierto={abierto?.id === prestador.id}
              secciones={abierto?.id === prestador.id ? abierto.secciones : seccionesDe(prestador.pendientes)}
              cliente={cliente}
              alAlternar={() => alternar(prestador)}
              alCambiar={() => void cargar(pagina)}
            />
          ))}
        </ul>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas de prestadores con pendientes" className="mt-5 flex items-center justify-between gap-3 text-sm">
          <Boton
            type="button"
            variante="secundario"
            className="w-auto! px-5"
            disabled={pagina <= 1}
            onClick={() => {
              setAbierto(null);
              setPagina(pagina - 1);
            }}
          >
            Anterior
          </Boton>
          <span className="text-texto-suave">
            Página {pagina} de {paginas}
          </span>
          <Boton
            type="button"
            variante="secundario"
            className="w-auto! px-5"
            disabled={pagina >= paginas}
            onClick={() => {
              setAbierto(null);
              setPagina(pagina + 1);
            }}
          >
            Siguiente
          </Boton>
        </nav>
      )}
    </section>
  );
}
