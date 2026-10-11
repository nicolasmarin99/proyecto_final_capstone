import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  LARGO_MAXIMO_DESCRIPCION_SERVICIO,
  LARGO_MAXIMO_TITULO,
  LARGO_MINIMO_DESCRIPCION_SERVICIO,
  LARGO_MINIMO_TITULO,
  PRECIO_MAXIMO,
} from "@localcl/shared";
import {
  ErrorApi,
  type Categoria,
  type ClienteApi,
  type DatosServicio,
  type EstadoServicio,
  type RequisitoPendiente,
  type ServicioPropio,
  type UnidadPrecio,
} from "../api/cliente";
import { NOMBRE_UNIDAD, textoPrecio } from "../servicios/formato";
import { Boton, clasesBoton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { CampoTexto } from "./CampoTexto";
import { clasesControl, MensajeCampo, mensajeVisible } from "./MensajeCampo";

const ESTADO_VISIBLE: Record<EstadoServicio, { texto: string; clases: string }> = {
  PUBLICADO: { texto: "Publicado", clases: "bg-exito-50 text-exito-700" },
  PAUSADO: { texto: "Pausado", clases: "bg-niebla text-texto-suave" },
  BORRADOR: { texto: "Borrador", clases: "bg-niebla text-texto-suave" },
  OCULTO: { texto: "Oculto por moderación", clases: "bg-alerta-50 text-alerta-700" },
};

/** Datos para volver a enviar un servicio tal cual, cambiando solo el estado. */
function datosDe(servicio: ServicioPropio, estado: "PUBLICADO" | "PAUSADO"): DatosServicio {
  return {
    categoria: servicio.categoria.slug,
    titulo: servicio.titulo,
    descripcion: servicio.descripcion,
    precioDesde: servicio.precioDesde,
    precioHasta: servicio.precioHasta,
    unidadPrecio: servicio.unidadPrecio,
    estado,
  };
}

function esUnidad(valor: string): valor is UnidadPrecio {
  return Object.hasOwn(NOMBRE_UNIDAD, valor);
}

function mensajeError(causa: unknown, porDefecto: string) {
  return causa instanceof ErrorApi ? causa.message : porDefecto;
}

// ─── Formulario ────────────────────────────────────────────────────────────

interface Formulario {
  categoria: string;
  titulo: string;
  descripcion: string;
  precioDesde: string;
  precioHasta: string;
  unidadPrecio: UnidadPrecio | "";
  publicar: boolean;
}

function formularioDe(servicio: ServicioPropio | null): Formulario {
  return {
    categoria: servicio?.categoria.slug ?? "",
    titulo: servicio?.titulo ?? "",
    descripcion: servicio?.descripcion ?? "",
    precioDesde: servicio?.precioDesde === null || !servicio ? "" : String(servicio.precioDesde),
    precioHasta: servicio?.precioHasta === null || !servicio ? "" : String(servicio.precioHasta),
    unidadPrecio: servicio?.unidadPrecio ?? "",
    // Uno nuevo se publica por defecto; al editar se respeta su estado.
    publicar: servicio ? servicio.estado === "PUBLICADO" : true,
  };
}

/** Pesos enteros, o null si el campo quedó vacío. NaN marca un valor inválido. */
function leerPrecio(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const numero = Number(limpio);
  return Number.isInteger(numero) && numero >= 0 && numero <= PRECIO_MAXIMO ? numero : Number.NaN;
}

/**
 * Las mismas reglas que la API (esquemaServicio), con los mismos mensajes.
 * Avisa sin esperar al servidor; la validación que manda es la de la API.
 */
function validar(formulario: Formulario): { errores: Record<string, string>; datos: DatosServicio | null } {
  const errores: Record<string, string> = {};
  const titulo = formulario.titulo.trim();
  const descripcion = formulario.descripcion.trim();
  const desde = leerPrecio(formulario.precioDesde);
  const hasta = leerPrecio(formulario.precioHasta);

  if (!formulario.categoria) errores.categoria = "Elige una categoría.";
  if (titulo.length < LARGO_MINIMO_TITULO) errores.titulo = `El título debe tener al menos ${LARGO_MINIMO_TITULO} caracteres.`;
  else if (titulo.length > LARGO_MAXIMO_TITULO) errores.titulo = `El título no puede superar los ${LARGO_MAXIMO_TITULO} caracteres.`;
  if (descripcion.length < LARGO_MINIMO_DESCRIPCION_SERVICIO) {
    errores.descripcion = `La descripción debe tener al menos ${LARGO_MINIMO_DESCRIPCION_SERVICIO} caracteres.`;
  } else if (descripcion.length > LARGO_MAXIMO_DESCRIPCION_SERVICIO) {
    errores.descripcion = `La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION_SERVICIO} caracteres.`;
  }
  if (Number.isNaN(desde)) errores.precioDesde = "Escribe el precio en pesos, sin puntos ni decimales.";
  if (Number.isNaN(hasta)) errores.precioHasta = "Escribe el precio en pesos, sin puntos ni decimales.";
  else if (hasta !== null && desde === null) errores.precioHasta = "Indica también el precio desde.";
  else if (hasta !== null && desde !== null && !Number.isNaN(desde) && desde > hasta) {
    errores.precioHasta = "El precio hasta no puede ser menor que el precio desde.";
  }
  if (desde !== null && !Number.isNaN(desde) && !formulario.unidadPrecio) {
    errores.unidadPrecio = "Indica cómo cobras: por servicio, por hora, por día…";
  }

  if (Object.keys(errores).length > 0) return { errores, datos: null };

  return {
    errores,
    datos: {
      categoria: formulario.categoria,
      titulo,
      descripcion,
      precioDesde: desde,
      precioHasta: hasta,
      // Sin precio es «a convenir»: la unidad no aplica.
      unidadPrecio: desde === null ? null : formulario.unidadPrecio || null,
      estado: formulario.publicar ? "PUBLICADO" : "PAUSADO",
    },
  };
}

/** Selector nativo con el mismo estilo y mensajes que el resto de los campos. */
function CampoSelector({
  id,
  etiqueta,
  valor,
  alCambiar,
  opciones,
  vacio,
  error,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar(valor: string): void;
  opciones: { valor: string; texto: string }[];
  vacio: string;
  error?: string;
  ayuda?: string;
}) {
  const idMensaje = `${id}-mensaje`;
  const mensajes = { error, ayuda };

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-bold text-noche">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={mensajeVisible(mensajes) ? idMensaje : undefined}
        className={`mt-1.5 h-12 cursor-pointer ${clasesControl(mensajes)}`}
      >
        <option value="">{vacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      <MensajeCampo id={idMensaje} mensajes={mensajes} />
    </div>
  );
}

function FormularioServicio({
  categorias,
  inicial,
  enviando,
  erroresApi,
  alEnviar,
  alCancelar,
}: {
  categorias: Categoria[];
  inicial: ServicioPropio | null;
  enviando: boolean;
  erroresApi: Record<string, string>;
  alEnviar(datos: DatosServicio): void;
  alCancelar(): void;
}) {
  const [formulario, setFormulario] = useState<Formulario>(() => formularioDe(inicial));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const prefijo = useId();
  const visibles = { ...errores, ...erroresApi };
  const conPrecio = formulario.precioDesde.trim() !== "";

  function cambiar<C extends keyof Formulario>(campo: C) {
    return (valor: Formulario[C]) => setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const { errores: encontrados, datos } = validar(formulario);
    setErrores(encontrados);
    if (datos) alEnviar(datos);
  }

  return (
    <form onSubmit={enviar} noValidate className="mt-4 rounded-medio border border-borde p-4 sm:p-5">
      <h3 className="font-titulos text-base font-bold text-noche">{inicial ? "Editar servicio" : "Nuevo servicio"}</h3>

      <CampoSelector
        id={`${prefijo}-categoria`}
        etiqueta="Categoría"
        valor={formulario.categoria}
        alCambiar={cambiar("categoria")}
        opciones={categorias.map((categoria) => ({ valor: categoria.slug, texto: categoria.nombre }))}
        vacio="Elige la categoría"
        error={visibles.categoria}
      />
      <CampoTexto
        id={`${prefijo}-titulo`}
        etiqueta="Título"
        autoComplete="off"
        valor={formulario.titulo}
        alCambiar={cambiar("titulo")}
        error={visibles.titulo}
        ayuda={`Lo primero que ve un cliente. De ${LARGO_MINIMO_TITULO} a ${LARGO_MAXIMO_TITULO} caracteres.`}
      />
      <CampoAreaTexto
        id={`${prefijo}-descripcion`}
        etiqueta="Descripción del servicio"
        valor={formulario.descripcion}
        alCambiar={cambiar("descripcion")}
        minimo={LARGO_MINIMO_DESCRIPCION_SERVICIO}
        maximo={LARGO_MAXIMO_DESCRIPCION_SERVICIO}
        error={visibles.descripcion}
        ayuda="Qué incluye, qué no, y en cuánto tiempo sueles responder."
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <CampoTexto
          id={`${prefijo}-desde`}
          etiqueta="Precio desde (opcional)"
          tipo="number"
          inputMode="numeric"
          autoComplete="off"
          valor={formulario.precioDesde}
          alCambiar={cambiar("precioDesde")}
          error={visibles.precioDesde}
          ayuda="En pesos. Vacío = «a convenir»."
        />
        <CampoTexto
          id={`${prefijo}-hasta`}
          etiqueta="Precio hasta (opcional)"
          tipo="number"
          inputMode="numeric"
          autoComplete="off"
          valor={formulario.precioHasta}
          alCambiar={cambiar("precioHasta")}
          error={visibles.precioHasta}
        />
      </div>

      {conPrecio && (
        <CampoSelector
          id={`${prefijo}-unidad`}
          etiqueta="¿Cómo cobras?"
          valor={formulario.unidadPrecio}
          alCambiar={(valor) => cambiar("unidadPrecio")(esUnidad(valor) ? valor : "")}
          opciones={Object.entries(NOMBRE_UNIDAD).map(([valor, texto]) => ({ valor, texto }))}
          vacio="Elige la unidad"
          error={visibles.unidadPrecio}
        />
      )}

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-noche">
        <input
          type="checkbox"
          checked={formulario.publicar}
          onChange={(evento) => cambiar("publicar")(evento.target.checked)}
          className="mt-0.5 size-5 cursor-pointer accent-primario"
        />
        <span>
          <span className="font-semibold">Publicar al guardar</span>
          <span className="block text-texto-suave">
            Si te falta algo para publicar, se guarda pausado y te decimos qué.
          </span>
        </span>
      </label>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Boton type="button" variante="secundario" onClick={alCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : "Guardar servicio"}
        </Boton>
      </div>
    </form>
  );
}

// ─── Fila de la lista ──────────────────────────────────────────────────────

function FilaServicio({
  servicio,
  alEditar,
  alCambiarEstado,
  alEliminar,
}: {
  servicio: ServicioPropio;
  alEditar(): void;
  alCambiarEstado(estado: "PUBLICADO" | "PAUSADO"): Promise<string | null>;
  alEliminar(): Promise<string | null>;
}) {
  const idTitulo = useId();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estado = ESTADO_VISIBLE[servicio.estado];

  async function ejecutar(accion: () => Promise<string | null>) {
    setOcupado(true);
    setError(await accion());
    setOcupado(false);
    setConfirmando(false);
  }

  return (
    <article aria-labelledby={idTitulo} className="rounded-medio border border-borde p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={idTitulo} className="font-titulos text-base font-bold text-noche">
          {servicio.titulo}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clases}`}>{estado.texto}</span>
      </div>
      <p className="mt-1 text-sm text-texto-suave">
        {servicio.categoria.nombre} · {textoPrecio(servicio)}
      </p>

      {error && (
        <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {confirmando ? (
        <div className="mt-3 rounded-chico bg-error-50 p-3 text-sm text-error-700">
          <p className="font-semibold">¿Eliminar este servicio? No se puede deshacer.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton type="button" variante="secundario" disabled={ocupado} onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
            <Boton type="button" cargando={ocupado} onClick={() => ejecutar(alEliminar)}>
              Sí, eliminar
            </Boton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={alEditar}>
            Editar
          </Boton>
          {servicio.estado === "PUBLICADO" && (
            <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => ejecutar(() => alCambiarEstado("PAUSADO"))}>
              Pausar
            </Boton>
          )}
          {servicio.estado === "PAUSADO" && (
            <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => ejecutar(() => alCambiarEstado("PUBLICADO"))}>
              Publicar
            </Boton>
          )}
          {servicio.estado === "PUBLICADO" && (
            <Link to={`/servicios/${servicio.id}`} className={`w-auto! px-4 ${clasesBoton("secundario")}`}>
              Ver publicación
            </Link>
          )}
          <Boton type="button" variante="secundario" className="w-auto! px-4" disabled={ocupado} onClick={() => setConfirmando(true)}>
            Eliminar
          </Boton>
        </div>
      )}
    </article>
  );
}

// ─── Sección ───────────────────────────────────────────────────────────────

/**
 * Servicios del prestador: lista, alta, edición, pausa y eliminación.
 *
 * Los requisitos para publicar los calcula la API; acá solo se muestran.
 * `version` cambia cuando el prestador guarda sus comunas, para volver a
 * preguntar qué le falta.
 */
export function ServiciosPrestador({ cliente, version = 0 }: { cliente: ClienteApi; version?: number }) {
  const idTitulo = useId();
  const [servicios, setServicios] = useState<ServicioPropio[] | null>(null);
  const [requisitos, setRequisitos] = useState<RequisitoPendiente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<ServicioPropio | "nuevo" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroresApi, setErroresApi] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const datos = await cliente.listarMisServicios();
      setServicios(datos.servicios);
      setRequisitos(datos.requisitosPendientes);
    } catch (causa) {
      setError(mensajeError(causa, "No fue posible cargar tus servicios."));
    }
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  useEffect(() => {
    cliente.listarCategorias().then(setCategorias, () => setCategorias([]));
  }, [cliente]);

  /** Reemplaza o agrega el servicio guardado y explica en qué estado quedó. */
  function alGuardado(servicio: ServicioPropio, pendientes: RequisitoPendiente[], pidioPublicar: boolean) {
    setServicios((actuales) => [servicio, ...(actuales ?? []).filter((otro) => otro.id !== servicio.id)]);
    setRequisitos(pendientes);
    // Lo que falta se lista una sola vez, en el recuadro de requisitos de
    // arriba; el aviso solo dice en qué estado quedó y remite a él.
    setAviso(
      pidioPublicar && servicio.estado !== "PUBLICADO"
        ? `«${servicio.titulo}» quedó pausado: revisa arriba lo que te falta para publicarlo.`
        : servicio.estado === "PUBLICADO"
          ? `«${servicio.titulo}» está publicado.`
          : `«${servicio.titulo}» quedó guardado como ${ESTADO_VISIBLE[servicio.estado].texto.toLowerCase()}.`,
    );
  }

  async function guardar(datos: DatosServicio) {
    setEnviando(true);
    setErroresApi({});
    try {
      const resultado =
        editando && editando !== "nuevo"
          ? await cliente.editarServicio(editando.id, datos)
          : await cliente.crearServicio(datos);
      alGuardado(resultado.servicio, resultado.requisitosPendientes, datos.estado === "PUBLICADO");
      setEditando(null);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.codigo === "DATOS_INVALIDOS") {
        setErroresApi(Object.fromEntries(causa.detalles.map((detalle) => [detalle.campo, detalle.mensaje])));
      } else {
        setError(mensajeError(causa, "No fue posible guardar el servicio."));
      }
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(servicio: ServicioPropio, estado: "PUBLICADO" | "PAUSADO") {
    try {
      const resultado = await cliente.editarServicio(servicio.id, datosDe(servicio, estado));
      alGuardado(resultado.servicio, resultado.requisitosPendientes, estado === "PUBLICADO");
      return null;
    } catch (causa) {
      return mensajeError(causa, "No fue posible cambiar el estado.");
    }
  }

  async function eliminar(servicio: ServicioPropio) {
    try {
      await cliente.eliminarServicio(servicio.id);
      setServicios((actuales) => (actuales ?? []).filter((otro) => otro.id !== servicio.id));
      setAviso(`«${servicio.titulo}» fue eliminado.`);
      return null;
    } catch (causa) {
      return mensajeError(causa, "No fue posible eliminar el servicio.");
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-8 border-t border-borde pt-6">
      <h2 id={idTitulo} className="font-titulos text-lg font-bold text-noche">
        Tus servicios
      </h2>

      {requisitos.length > 0 && (
        <div className="mt-3 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
          <p className="font-semibold">Tus servicios no se pueden publicar todavía. Te falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {requisitos.map((requisito) => (
              <li key={requisito.codigo}>{requisito.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      {aviso && (
        <p role="status" className="motion-safe:animate-aparecer-corto mt-3 rounded-chico border border-borde bg-hielo/60 px-4 py-3 text-sm text-noche">
          {aviso}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}

      {servicios === null && !error && <p className="mt-3 text-sm text-texto-suave">Cargando tus servicios…</p>}

      {servicios?.length === 0 && editando === null && (
        <p className="mt-3 text-sm text-texto-suave">Todavía no publicas ningún servicio.</p>
      )}

      {servicios && servicios.length > 0 && (
        <div className="mt-4 space-y-3">
          {servicios.map((servicio) => (
            <FilaServicio
              key={servicio.id}
              servicio={servicio}
              alEditar={() => {
                setErroresApi({});
                setEditando(servicio);
              }}
              alCambiarEstado={(estado) => cambiarEstado(servicio, estado)}
              alEliminar={() => eliminar(servicio)}
            />
          ))}
        </div>
      )}

      {editando ? (
        <FormularioServicio
          // Un formulario nuevo por servicio: así no arrastra datos del anterior.
          key={editando === "nuevo" ? "nuevo" : editando.id}
          categorias={categorias}
          inicial={editando === "nuevo" ? null : editando}
          enviando={enviando}
          erroresApi={erroresApi}
          alEnviar={guardar}
          alCancelar={() => setEditando(null)}
        />
      ) : (
        servicios !== null && (
          <Boton type="button" variante="secundario" className="mt-4" onClick={() => setEditando("nuevo")}>
            Nuevo servicio
          </Boton>
        )
      )}
    </section>
  );
}
