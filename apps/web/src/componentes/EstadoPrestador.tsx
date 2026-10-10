import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import type { ClienteApi, EstadoIdentidad } from "../api/cliente";
import { clasesBoton } from "./Boton";
import { Icono } from "./iconos";

interface Paso {
  titulo: string;
  listo: boolean;
  detalle: string;
  /** Texto del estado cuando no está listo. Por defecto, "Pendiente". */
  estadoTexto?: string;
}

/** El paso de identidad según la última verificación del prestador. */
function pasoIdentidad(identidad: EstadoIdentidad | null | undefined): Paso {
  const titulo = "Identidad verificada";

  switch (identidad?.estado) {
    case "VERIFICADA":
      return { titulo, listo: true, detalle: "Revisamos tu cédula y la eliminamos." };
    case "PENDIENTE":
      return { titulo, listo: false, estadoTexto: "En revisión", detalle: "Un administrador está revisando tu cédula." };
    case "RECHAZADA":
      return {
        titulo,
        listo: false,
        detalle: `Rechazada: ${identidad.motivoRechazo ?? "sin motivo"}. Puedes volver a subirla.`,
      };
    default:
      // undefined: no se pudo consultar; null: nunca la subió.
      return {
        titulo,
        listo: false,
        detalle:
          identidad === undefined
            ? "No pudimos consultar el estado de tu verificación."
            : "Sube tu cédula desde tu perfil de prestador.",
      };
  }
}

/**
 * Qué le falta a un prestador para aparecer en las búsquedas.
 *
 * Publicar servicios todavía no existe en la plataforma: se muestra como
 * pendiente y sin enlace, para no prometer una pantalla que no hay.
 */
export function EstadoPrestador({ cliente }: { cliente: ClienteApi }) {
  const idTitulo = useId();
  // undefined mientras carga; false si todavía no creó su perfil.
  const [tienePerfil, setTienePerfil] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState(false);
  // undefined si no se pudo consultar; null si nunca subió su cédula.
  const [identidad, setIdentidad] = useState<EstadoIdentidad | null | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;

    cliente
      .obtenerMiPerfilPrestador()
      .then((perfil) => {
        if (!cancelado) setTienePerfil(perfil !== null);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });

    // Aparte del perfil: si esta consulta falla, el resto del estado igual se muestra.
    cliente
      .obtenerMiIdentidad()
      .then((datos) => {
        if (!cancelado) setIdentidad(datos.identidad);
      })
      .catch(() => {
        if (!cancelado) setIdentidad(undefined);
      });

    return () => {
      cancelado = true;
    };
  }, [cliente]);

  if (error) {
    return (
      <p className="mt-6 text-sm text-texto-suave">No fue posible revisar el estado de tu perfil de prestador.</p>
    );
  }

  if (tienePerfil === undefined) {
    return <p className="mt-6 text-sm text-texto-suave">Revisando tu perfil de prestador…</p>;
  }

  const pasos: Paso[] = [
    {
      titulo: "Perfil completo",
      listo: tienePerfil,
      detalle: tienePerfil ? "Comuna, descripción, teléfono y radio de atención." : "Te falta crearlo.",
    },
    pasoIdentidad(identidad),
    {
      titulo: "Al menos un servicio publicado",
      listo: false,
      detalle: "La publicación de servicios aún no está disponible.",
    },
  ];
  const pendientes = pasos.filter((paso) => !paso.listo).length;

  return (
    <section className="mt-6 rounded-chico border border-borde p-4">
      <h2 id={idTitulo} className="font-titulos text-base font-bold text-noche">
        Para aparecer en las búsquedas
      </h2>
      <p className="mt-1 text-sm text-texto-suave">
        {pendientes === 0
          ? "Ya apareces en las búsquedas."
          : `Todavía no apareces: ${pendientes === 1 ? "falta 1 paso" : `faltan ${pendientes} pasos`}.`}
      </p>

      <ul aria-labelledby={idTitulo} className="mt-3 space-y-3">
        {pasos.map((paso) => (
          <li key={paso.titulo} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                paso.listo ? "bg-exito-50 text-exito-700" : "border-2 border-borde-fuerte"
              }`}
            >
              {paso.listo && <Icono nombre="visto" tamano={16} grosor={2.4} />}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-noche">{paso.titulo}</span>
                {/* El estado va en texto: el color y el ícono solos no bastan. */}
                <span className={`font-medium ${paso.listo ? "text-exito-700" : "text-texto-suave"}`}>
                  {paso.listo ? "Listo" : (paso.estadoTexto ?? "Pendiente")}
                </span>
              </span>
              <span className="block text-texto-suave">{paso.detalle}</span>
            </span>
          </li>
        ))}
      </ul>

      <Link to="/perfil-prestador" className={`mt-4 ${clasesBoton(tienePerfil ? "secundario" : "principal")}`}>
        {tienePerfil ? "Editar mi perfil de prestador" : "Completar mi perfil de prestador"}
      </Link>
    </section>
  );
}
