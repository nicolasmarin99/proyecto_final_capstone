import { useId, useState } from "react";
import { MAXIMO_COMUNAS_ATENCION } from "@localcl/shared";
import { ErrorApi, type ClienteApi, type Comuna } from "../api/cliente";
import { Boton } from "./Boton";
import { Icono } from "./iconos";
import { SelectorComuna } from "./SelectorComuna";

const ordenEspanol = new Intl.Collator("es");

/**
 * Comunas donde atiende el prestador: se agregan de a una con el mismo
 * selector agrupado por región y se guardan juntas. Es independiente de la
 * comuna base del perfil, que queda para la búsqueda por cercanía.
 */
export function ComunasAtencion({
  cliente,
  comunas,
  iniciales,
  alGuardar,
}: {
  cliente: ClienteApi;
  /** Todas las comunas del país, para el selector. */
  comunas: Comuna[];
  iniciales: Comuna[];
  alGuardar(guardadas: Comuna[]): void;
}) {
  const idTitulo = useId();
  const [elegidas, setElegidas] = useState<Comuna[]>(iniciales);
  const [porAgregar, setPorAgregar] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [guardadas, setGuardadas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Las ya elegidas no se ofrecen de nuevo en el selector.
  const disponibles = comunas.filter((comuna) => !elegidas.some((elegida) => elegida.id === comuna.id));
  const lleno = elegidas.length >= MAXIMO_COMUNAS_ATENCION;

  function agregar() {
    const comuna = comunas.find((candidata) => String(candidata.id) === porAgregar);
    if (!comuna || lleno) return;

    setElegidas((actuales) => [...actuales, comuna].sort((a, b) => ordenEspanol.compare(a.nombre, b.nombre)));
    setPorAgregar("");
    setGuardadas(false);
    setError(undefined);
  }

  function quitar(id: number) {
    setElegidas((actuales) => actuales.filter((comuna) => comuna.id !== id));
    setGuardadas(false);
  }

  async function guardar() {
    if (elegidas.length === 0) {
      setError("Elige al menos una comuna donde atiendes.");
      return;
    }

    setGuardando(true);
    setError(undefined);
    try {
      const resultado = await cliente.definirComunasAtencion(elegidas.map((comuna) => comuna.id));
      setElegidas(resultado);
      setGuardadas(true);
      alGuardar(resultado);
    } catch (causa) {
      setError(
        causa instanceof ErrorApi ? (causa.mensajeDe("comunaIds") ?? causa.message) : "No fue posible guardar las comunas.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Comunas donde atiendes
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        Se muestran en tus servicios. Puedes elegir hasta {MAXIMO_COMUNAS_ATENCION}.
      </p>

      {elegidas.length > 0 ? (
        <ul aria-label="Comunas elegidas" className="mt-3 flex flex-wrap gap-2">
          {elegidas.map((comuna) => (
            <li
              key={comuna.id}
              className="flex items-center gap-1 rounded-full border border-borde-fuerte bg-hielo/60 py-1 pr-1 pl-3 text-sm text-noche"
            >
              {comuna.nombre}
              <button
                type="button"
                onClick={() => quitar(comuna.id)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-texto-suave hover:bg-blanco hover:text-error-700 focus-visible:outline-2 focus-visible:outline-primario"
              >
                <Icono nombre="cerrar" tamano={14} grosor={2.2} />
                <span className="sr-only">Quitar {comuna.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-medium text-alerta-700">
          Todavía no eliges comunas: tus servicios no se pueden publicar sin al menos una.
        </p>
      )}

      {!lleno && (
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <SelectorComuna
              id="comuna-atencion"
              etiqueta="Agregar comuna"
              comunas={disponibles}
              valor={porAgregar}
              alCambiar={setPorAgregar}
            />
          </div>
          <Boton
            type="button"
            variante="secundario"
            disabled={!porAgregar}
            onClick={agregar}
            className="mb-1.5 w-auto! px-5"
          >
            Agregar
          </Boton>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
      {guardadas && (
        <p role="status" className="motion-safe:animate-aparecer-corto mt-3 text-sm font-medium text-exito-700">
          Comunas guardadas.
        </p>
      )}

      <Boton type="button" cargando={guardando} onClick={guardar} className="mt-4">
        {guardando ? "Guardando…" : "Guardar comunas"}
      </Boton>
    </section>
  );
}
