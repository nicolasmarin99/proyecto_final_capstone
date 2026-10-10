import type { Comuna, Region } from "../api/cliente";
import { clasesControl, MensajeCampo, mensajeVisible, type Mensajes } from "./MensajeCampo";

interface Props extends Mensajes {
  id: string;
  comunas: Comuna[];
  /** Id de la comuna elegida, o "" si todavía no hay. */
  valor: string;
  alCambiar(valor: string): void;
  cargando?: boolean;
}

/**
 * Agrupa las comunas por región, ordenando las regiones de norte a sur. Las
 * comunas ya vienen ordenadas por nombre desde la API y se conserva ese orden
 * dentro de cada grupo.
 */
function agruparPorRegion(comunas: Comuna[]): { region: Region; comunas: Comuna[] }[] {
  const grupos = new Map<number, { region: Region; comunas: Comuna[] }>();

  for (const comuna of comunas) {
    const grupo = grupos.get(comuna.region.id) ?? { region: comuna.region, comunas: [] };
    grupo.comunas.push(comuna);
    grupos.set(comuna.region.id, grupo);
  }

  return [...grupos.values()].sort((a, b) => a.region.orden - b.region.orden);
}

/**
 * Selector nativo con <optgroup>. Se prefiere al combobox con búsqueda de una
 * librería: no agrega dependencias, funciona con teclado y lector de pantalla
 * sin trabajo extra, y en el celular abre el selector del sistema. Escribir
 * las primeras letras salta a la comuna, también entre 346.
 */
export function SelectorComuna({ id, comunas, valor, alCambiar, cargando = false, ...mensajes }: Props) {
  const idMensaje = `${id}-mensaje`;

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-bold text-noche">
        Comuna
      </label>
      <select
        id={id}
        name={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={cargando}
        aria-invalid={mensajes.error ? true : undefined}
        aria-describedby={mensajeVisible(mensajes) ? idMensaje : undefined}
        className={`mt-1.5 h-12 cursor-pointer disabled:cursor-wait disabled:opacity-60 ${clasesControl(mensajes)}`}
      >
        <option value="">{cargando ? "Cargando comunas…" : "Elige la comuna donde trabajas"}</option>
        {agruparPorRegion(comunas).map(({ region, comunas: delGrupo }) => (
          <optgroup key={region.id} label={region.nombre}>
            {delGrupo.map((comuna) => (
              <option key={comuna.id} value={String(comuna.id)}>
                {comuna.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <MensajeCampo id={idMensaje} mensajes={mensajes} />
    </div>
  );
}
