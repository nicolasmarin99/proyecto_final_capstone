import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  LARGO_MAXIMO_CATEGORIA_PERSONALIZADA,
  LARGO_MAXIMO_DESCRIPCION_SERVICIO,
  LARGO_MAXIMO_TITULO,
  LARGO_MINIMO_CATEGORIA_PERSONALIZADA,
  LARGO_MINIMO_DESCRIPCION_SERVICIO,
  LARGO_MINIMO_TITULO,
  PRECIO_MAXIMO,
  SLUG_CATEGORIA_OTROS,
} from "@localcl/shared";
import type { Categoria, DatosServicio, RequisitoPendiente, ServicioPropio, UnidadPrecio } from "../api/cliente";
import { NOMBRE_UNIDAD } from "../servicios/formato";
import { Boton } from "./Boton";
import { CampoAreaTexto } from "./CampoAreaTexto";
import { CampoTexto } from "./CampoTexto";
import { Icono } from "./iconos";
import { CampoSelector } from "./CampoSelector";

/** Dónde se resuelve cada requisito que informa la API. */
const DONDE_RESOLVER: Record<string, { ruta: string; texto: string }> = {
  IDENTIDAD_NO_VERIFICADA: { ruta: "/mi/identidad", texto: "Verificar mi identidad" },
  SIN_COMUNAS_ATENCION: { ruta: "/mi/perfil", texto: "Agregar comunas" },
};

function esUnidad(valor: string): valor is UnidadPrecio {
  return Object.hasOwn(NOMBRE_UNIDAD, valor);
}

interface Formulario {
  categoria: string;
  categoriaPersonalizada: string;
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
    categoriaPersonalizada: servicio?.categoriaPersonalizada ?? "",
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
  const esOtros = formulario.categoria === SLUG_CATEGORIA_OTROS;
  const oficio = formulario.categoriaPersonalizada.trim();
  if (
    esOtros &&
    (oficio.length < LARGO_MINIMO_CATEGORIA_PERSONALIZADA || oficio.length > LARGO_MAXIMO_CATEGORIA_PERSONALIZADA)
  ) {
    errores.categoriaPersonalizada = `Escribe el nombre de tu oficio (de ${LARGO_MINIMO_CATEGORIA_PERSONALIZADA} a ${LARGO_MAXIMO_CATEGORIA_PERSONALIZADA} caracteres).`;
  }
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
      // Solo con «Otros»: en cualquier otra categoría no aplica.
      categoriaPersonalizada: esOtros ? oficio : null,
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

/**
 * Aviso previo al envío: qué hace falta para que el servicio se vea y, si
 * algo falta, que se guardará pausado. Así nadie descubre después de guardar
 * que su servicio no aparece. La regla la aplica la API; acá solo se anticipa
 * con los requisitos que ella misma informó.
 */
function AvisoPublicacion({ requisitos, publicar }: { requisitos: RequisitoPendiente[] | null; publicar: boolean }) {
  if (requisitos === null) return null;

  if (requisitos.length === 0) {
    return (
      <div className="mt-6 flex gap-2.5 rounded-chico border border-exito-700/20 bg-exito-50 px-4 py-3 text-sm text-exito-700">
        <Icono nombre="visto" tamano={18} grosor={2.2} className="mt-0.5 shrink-0" />
        <p>
          Tienes tu identidad verificada y comunas de atención: {publicar ? "al guardar, los clientes podrán verlo." : "puedes publicarlo cuando quieras."}
        </p>
      </div>
    );
  }

  return (
    <div role="note" className="mt-6 rounded-chico border border-alerta-700/20 bg-alerta-50 px-4 py-3 text-sm text-alerta-700">
      <p className="font-semibold">
        Para que los clientes vean un servicio necesitas tu identidad verificada y al menos una comuna de atención.
      </p>
      <p className="mt-1">Te falta:</p>
      <ul className="mt-1 space-y-1">
        {requisitos.map((requisito) => {
          const donde = DONDE_RESOLVER[requisito.codigo];
          return (
            <li key={requisito.codigo} className="flex flex-wrap items-baseline gap-x-2">
              <span>· {requisito.mensaje}</span>
              {donde && (
                <Link to={donde.ruta} className="font-semibold underline underline-offset-2 hover:text-noche">
                  {donde.texto}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2">Puedes guardarlo igual: quedará pausado y se podrá publicar cuando completes lo que falta.</p>
    </div>
  );
}

/**
 * Formulario de un servicio, para crearlo o editarlo.
 *
 * `requisitos` son los que informó la API para este prestador (null si
 * todavía no llegan): con ellos se avisa antes de enviar si quedará pausado.
 */
export function FormularioServicio({
  categorias,
  inicial,
  requisitos,
  enviando,
  erroresApi,
  alEnviar,
  alCancelar,
  imagenes,
}: {
  categorias: Categoria[];
  inicial: ServicioPropio | null;
  requisitos: RequisitoPendiente[] | null;
  enviando: boolean;
  erroresApi: Record<string, string>;
  alEnviar(datos: DatosServicio): void;
  alCancelar(): void;
  /** La sección de fotos, que va antes del aviso y de los botones. */
  imagenes?: ReactNode;
}) {
  const [formulario, setFormulario] = useState<Formulario>(() => formularioDe(inicial));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const prefijo = useId();
  const visibles = { ...errores, ...erroresApi };
  const conPrecio = formulario.precioDesde.trim() !== "";
  const faltaAlgo = (requisitos?.length ?? 0) > 0;

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
    <form onSubmit={enviar} noValidate>
      <CampoSelector
        id={`${prefijo}-categoria`}
        etiqueta="Categoría"
        valor={formulario.categoria}
        alCambiar={cambiar("categoria")}
        opciones={categorias.map((categoria) => ({ valor: categoria.slug, texto: categoria.nombre }))}
        vacio="Elige la categoría"
        error={visibles.categoria}
      />
      {formulario.categoria === SLUG_CATEGORIA_OTROS && (
        <CampoTexto
          id={`${prefijo}-oficio`}
          etiqueta="Nombre de tu oficio"
          autoComplete="off"
          valor={formulario.categoriaPersonalizada}
          alCambiar={cambiar("categoriaPersonalizada")}
          error={visibles.categoriaPersonalizada}
          ayuda="Por ejemplo: Pintura de interiores, Jardinería, Mudanzas. Es lo que verán los clientes en lugar de «Otros»."
        />
      )}
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
          etiqueta="Precio desde"
          tipo="number"
          inputMode="numeric"
          autoComplete="off"
          valor={formulario.precioDesde}
          alCambiar={cambiar("precioDesde")}
          error={visibles.precioDesde}
          ayuda="Opcional, en pesos. Vacío = «a convenir»."
        />
        <CampoTexto
          id={`${prefijo}-hasta`}
          etiqueta="Precio hasta"
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
            {faltaAlgo
              ? "Mientras te falte algo de lo de abajo, se guarda pausado."
              : "Si lo desmarcas, se guarda pausado y lo publicas cuando quieras."}
          </span>
        </span>
      </label>

      {imagenes}

      <AvisoPublicacion requisitos={requisitos} publicar={formulario.publicar} />

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
