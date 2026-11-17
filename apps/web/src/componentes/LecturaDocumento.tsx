import { useEffect, useId, useRef, useState } from "react";
import type { AlertaLectura, CampoLeido, ClienteApi, ExtraccionDocumento, RevisionLectura } from "../api/cliente";
import { Icono } from "./iconos";

/*
  La lectura automática del documento, junto a él, para que el
  administrador contraste sin cambiar de pantalla.

  REGLA CENTRAL: la lectura SUGIERE; decide la persona. Por eso:
  - cada campo leído se muestra como «Sugerencia automática», distinto de lo
    que confirmó una persona, y esa marca solo desaparece cuando el
    administrador lo confirma o lo corrige;
  - NO hay «aceptar todo»: se confirma campo por campo (la fricción es
    intencional), y aprobar queda deshabilitado mientras falte alguno;
  - las alertas de la validación cruzada se ven arriba y destacadas, antes
    de los botones de decisión. No bloquean: un documento mal escaneado
    puede leerse mal.
  - Si la lectura está pendiente, falló o no existe, el formulario manual
    de siempre funciona exactamente igual.
*/

const ETIQUETA: Record<CampoLeido["campo"], string> = {
  nombre: "Nombre del titular",
  rut: "RUT",
  titulo: "Título",
  institucion: "Institución emisora",
  fechaEmision: "Fecha de emisión",
  fechaVencimiento: "Fecha de vencimiento",
};

/** Lo que el administrador hizo con un campo. */
type EstadoCampo = { tipo: "sugerencia" } | { tipo: "confirmado" } | { tipo: "corregido"; valor: string };

/** El estado de la revisión que ve la solicitud: si se puede aprobar y qué enviar. */
export interface EstadoRevision {
  /** Hay campos leídos que revisar. */
  conLectura: boolean;
  /** Campos todavía sin confirmar ni corregir. */
  faltan: number;
  /** Lo que se envía al decidir (undefined sin lectura: el flujo manual de siempre). */
  revision: RevisionLectura | undefined;
}

const SIN_LECTURA: EstadoRevision = { conLectura: false, faltan: 0, revision: undefined };

function porcentaje(confianza: number): string {
  return `${Math.round(confianza * 100)} %`;
}

function Alertas({ alertas }: { alertas: AlertaLectura[] }) {
  if (alertas.length === 0) return null;
  return (
    <div role="alert" className="rounded-medio border-2 border-error-700 bg-error-50 p-4 text-error-700">
      <p className="flex items-center gap-2 font-titulos text-base font-bold">
        <Icono nombre="escudo" tamano={20} grosor={2.2} className="shrink-0" />
        {alertas.length === 1 ? "Revisa esto antes de decidir" : `Revisa estas ${alertas.length} diferencias antes de decidir`}
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {alertas.map((alerta) => (
          <li key={alerta.campo}>
            <p className="font-semibold">{alerta.mensaje}</p>
            <dl className="mt-0.5 grid gap-x-3 sm:grid-cols-[auto_1fr]">
              <dt>En la cuenta:</dt>
              <dd className="font-semibold break-words">{alerta.declarado}</dd>
              <dt className="mt-1 sm:mt-0">En el documento:</dt>
              <dd className="font-semibold break-words">{alerta.leido}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        No bloquea la decisión: si el documento se leyó mal (foto borrosa, reflejo), compáralo tú mismo con la imagen.
      </p>
    </div>
  );
}

function FilaCampo({
  campo,
  estado,
  alCambiar,
}: {
  campo: CampoLeido;
  estado: EstadoCampo;
  alCambiar(estado: EstadoCampo): void;
}) {
  const id = useId();
  const [valor, setValor] = useState(estado.tipo === "corregido" ? estado.valor : campo.valor);
  const cambiado = valor.trim() !== campo.valor;
  const revisado = estado.tipo !== "sugerencia";

  return (
    <li
      className={`rounded-chico border p-3 ${
        revisado ? "border-borde bg-blanco" : campo.confianzaBaja ? "border-alerta-700/40 bg-alerta-50" : "border-dashed border-primario/40 bg-hielo/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-noche">
          {ETIQUETA[campo.campo]}
        </label>
        {estado.tipo === "sugerencia" && (
          <span className="flex items-center gap-1 rounded-full border border-dashed border-primario/50 px-2 py-0.5 text-xs font-semibold text-primario">
            Sugerencia automática
          </span>
        )}
        {estado.tipo === "confirmado" && <span className="rounded-full bg-exito-50 px-2 py-0.5 text-xs font-semibold text-exito-700">Confirmado por ti</span>}
        {estado.tipo === "corregido" && <span className="rounded-full bg-exito-50 px-2 py-0.5 text-xs font-semibold text-exito-700">Corregido por ti</span>}
      </div>

      {!revisado && campo.confianzaBaja && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-alerta-700">
          <Icono nombre="escudo" tamano={14} grosor={2.2} />
          Confianza baja ({porcentaje(campo.confianza)}): míralo con cuidado en el documento.
        </p>
      )}

      <input
        id={id}
        type="text"
        value={valor}
        disabled={revisado}
        onChange={(evento) => setValor(evento.target.value)}
        className={`mt-2 h-10 w-full rounded-chico border px-3 text-sm text-noche disabled:bg-niebla ${
          revisado ? "border-borde font-semibold" : "border-borde-fuerte italic"
        }`}
        aria-describedby={`${id}-ayuda`}
      />
      <p id={`${id}-ayuda`} className="sr-only">
        {revisado ? "Revisado por ti." : `Sugerencia automática, confianza ${porcentaje(campo.confianza)}. Confírmala o corrígela.`}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {revisado ? (
          <button
            type="button"
            onClick={() => alCambiar({ tipo: "sugerencia" })}
            className="min-h-9 cursor-pointer rounded-chico px-3 text-sm font-semibold text-primario hover:bg-niebla focus-visible:outline-2 focus-visible:outline-primario"
          >
            Volver a revisar
          </button>
        ) : (
          <button
            type="button"
            disabled={valor.trim() === ""}
            onClick={() => alCambiar(cambiado ? { tipo: "corregido", valor: valor.trim() } : { tipo: "confirmado" })}
            className="min-h-9 cursor-pointer rounded-chico border border-primario bg-blanco px-3 text-sm font-semibold text-primario hover:bg-hielo focus-visible:outline-2 focus-visible:outline-primario disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cambiado ? "Guardar corrección" : "Confirmar: coincide con el documento"}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * La lectura de una solicitud. Avisa a la solicitud, con `alCambiar`, si se
 * puede aprobar y qué revisión enviar al decidir.
 */
export function LecturaDocumento({
  credencialId,
  cliente,
  alCambiar,
}: {
  credencialId: string;
  cliente: ClienteApi;
  alCambiar(estado: EstadoRevision): void;
}) {
  const idTitulo = useId();
  const [extraccion, setExtraccion] = useState<ExtraccionDocumento | null | undefined>(undefined);
  const [estados, setEstados] = useState<Partial<Record<CampoLeido["campo"], EstadoCampo>>>({});
  // La función de la solicitud puede cambiar en cada render: se lee la última sin volver a disparar el aviso.
  const avisar = useRef(alCambiar);
  useEffect(() => {
    avisar.current = alCambiar;
  }, [alCambiar]);

  useEffect(() => {
    let cancelado = false;
    cliente.obtenerExtraccion(credencialId).then(
      (datos) => {
        if (!cancelado) setExtraccion(datos);
      },
      // Si no se puede cargar, el formulario manual sigue funcionando igual.
      () => {
        if (!cancelado) setExtraccion(null);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [cliente, credencialId]);

  const campos = extraccion?.estado === "EXTRAIDA" ? extraccion.campos : [];

  useEffect(() => {
    const campos = extraccion?.estado === "EXTRAIDA" ? extraccion.campos : [];
    if (campos.length === 0) {
      avisar.current(SIN_LECTURA);
      return;
    }
    const revision: RevisionLectura = campos.flatMap((campo) => {
      const estado = estados[campo.campo];
      if (!estado || estado.tipo === "sugerencia") return [];
      return [{ campo: campo.campo, resultado: estado.tipo === "corregido" ? ("CORREGIDO" as const) : ("ACEPTADO" as const) }];
    });
    avisar.current({ conLectura: true, faltan: campos.length - revision.length, revision });
  }, [extraccion, estados]);

  if (extraccion === undefined) {
    return <p className="text-sm text-texto-suave">Cargando la lectura automática…</p>;
  }

  if (extraccion === null || extraccion.estado !== "EXTRAIDA" || campos.length === 0) {
    const texto =
      extraccion?.estado === "PENDIENTE"
        ? "La lectura automática todavía está en curso."
        : extraccion?.estado === "FALLIDA"
          ? "La lectura automática no pudo leer este documento."
          : extraccion?.estado === "EXTRAIDA"
            ? "La lectura automática no encontró datos en este documento."
            : "Sin lectura automática para esta solicitud.";
    return (
      <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-texto-suave">
        {texto} Revísala a mano contra el documento, como siempre.
      </p>
    );
  }

  const revisados = campos.filter((campo) => (estados[campo.campo]?.tipo ?? "sugerencia") !== "sugerencia").length;

  return (
    <section aria-labelledby={idTitulo} className="space-y-3">
      <Alertas alertas={extraccion.alertas} />
      <div>
        <h4 id={idTitulo} className="font-titulos text-sm font-bold text-noche">
          Datos leídos del documento
        </h4>
        <p className="mt-0.5 text-xs text-texto-suave">
          Son sugerencias de la lectura automática, no datos verificados. Compara cada uno con el documento y confírmalo o
          corrígelo. {revisados} de {campos.length} revisados.
        </p>
      </div>
      <ul aria-label="Campos leídos" className="space-y-2">
        {campos.map((campo) => (
          <FilaCampo
            key={campo.campo}
            campo={campo}
            estado={estados[campo.campo] ?? { tipo: "sugerencia" }}
            alCambiar={(estado) => setEstados((actuales) => ({ ...actuales, [campo.campo]: estado }))}
          />
        ))}
      </ul>
    </section>
  );
}
