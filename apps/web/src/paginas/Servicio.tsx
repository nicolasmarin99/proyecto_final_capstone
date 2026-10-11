import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi, type ServicioPublico } from "../api/cliente";
import { useAuth } from "../auth/ContextoAuth";
import { Boton } from "../componentes/Boton";
import { Icono } from "../componentes/iconos";
import { Contenedor } from "../componentes/landing/Contenedor";
import { Footer } from "../componentes/landing/Footer";
import { Navbar } from "../componentes/landing/Navbar";
import { nombreCategoria, textoPrecio } from "../servicios/formato";

const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

/** Mensaje inicial de WhatsApp: dice desde dónde y por qué servicio escribe. */
function mensajeInicial(servicio: ServicioPublico): string {
  return `Hola ${servicio.prestador.nombre}, te escribo desde LocalCL por tu servicio «${servicio.titulo}».`;
}

/**
 * Contacto por WhatsApp, solo con sesión.
 *
 * El orden importa:
 * 1. Se abre la pestaña nueva en el mismo clic. Si se abriera después de
 *    esperar a la API, el navegador la bloquearía como ventana emergente.
 * 2. Se le quita `opener`: la página de destino no puede tocar la de LocalCL.
 * 3. Recién cuando la API registró el contacto y entregó el teléfono, la
 *    pestaña va a wa.me. Si la API rechaza, se cierra sin ir a ningún lado.
 */
function BotonWhatsApp({ servicio, cliente }: { servicio: ServicioPublico; cliente: ClienteApi }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function contactar() {
    setError(null);
    setEnviando(true);
    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;

    try {
      const telefono = await cliente.obtenerContacto(servicio.prestador.id, servicio.id);
      // wa.me espera el número sin "+" ni espacios: 56912345678.
      const destino = `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeInicial(servicio))}`;

      if (ventana) {
        ventana.location.href = destino;
      } else {
        // El navegador bloqueó la pestaña: se va en la misma.
        window.location.assign(destino);
      }
    } catch (causa) {
      ventana?.close();
      setError(causa instanceof ErrorApi ? causa.message : "No fue posible obtener el contacto. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <Boton type="button" cargando={enviando} onClick={contactar}>
        {enviando ? "Abriendo WhatsApp…" : "Contactar por WhatsApp"}
      </Boton>
      {error && (
        <p role="alert" className="motion-safe:animate-aparecer-corto mt-3 text-sm font-medium text-error-700">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-texto-suave">
        Al contactarlo queda registrado en tu cuenta: así después podrás dejarle una valoración.
      </p>
    </div>
  );
}

export default function PaginaServicio({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const { id = "" } = useParams();
  const { usuario } = useAuth();
  const [servicio, setServicio] = useState<ServicioPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setServicio(null);
    setError(null);

    cliente
      .obtenerServicioPublico(id)
      .then((encontrado) => {
        if (!cancelado) setServicio(encontrado);
      })
      .catch((causa: unknown) => {
        if (cancelado) return;
        setError(
          causa instanceof ErrorApi && causa.estado === 404
            ? "Este servicio no existe o no está publicado."
            : "No fue posible cargar el servicio.",
        );
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, id]);

  return (
    <div className="flex min-h-screen flex-col bg-niebla font-texto text-noche">
      <Navbar />
      <main className="grow">
        <Contenedor className="py-10 md:py-16">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div className="rounded-grande border border-borde bg-blanco p-8 text-center">
                <p className="text-lg text-noche">{error}</p>
                <Link to="/" className="mt-4 inline-block font-bold text-primario hover:text-noche">
                  Volver al inicio
                </Link>
              </div>
            )}

            {!error && !servicio && <p className="text-texto-suave">Cargando el servicio…</p>}

            {servicio && (
              <article className="motion-safe:animate-aparecer rounded-grande border border-borde bg-blanco p-6 shadow-tarjeta sm:p-8">
                <p className="text-sm font-bold tracking-[1.2px] text-primario uppercase">{nombreCategoria(servicio)}</p>
                <h1 className="mt-2 font-titulos text-[28px] leading-[1.15] font-bold tracking-[-0.5px] md:text-[36px]">
                  {servicio.titulo}
                </h1>
                <p className="mt-2 text-texto-suave">
                  Ofrecido por <span className="font-semibold text-noche">{servicio.prestador.nombre}</span>
                </p>
                <p className="mt-4 inline-block rounded-chico bg-hielo px-4 py-2 font-titulos text-lg font-bold text-noche">
                  {textoPrecio(servicio)}
                </p>

                <p className="mt-6 leading-relaxed whitespace-pre-line text-noche">{servicio.descripcion}</p>

                <section className="mt-8">
                  <h2 className="font-titulos text-lg font-bold">Comunas donde atiende</h2>
                  <ul aria-label="Comunas donde atiende" className="mt-3 flex flex-wrap gap-2">
                    {servicio.prestador.comunas.map((comuna) => (
                      <li key={comuna.id} className="rounded-full border border-borde-fuerte bg-blanco px-3 py-1 text-sm" title={comuna.region}>
                        {comuna.nombre}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="mt-8">
                  <h2 className="font-titulos text-lg font-bold">Credenciales verificadas</h2>
                  {servicio.prestador.credenciales.length === 0 ? (
                    <p className="mt-2 text-sm text-texto-suave">Este prestador todavía no tiene credenciales verificadas.</p>
                  ) : (
                    <ul aria-label="Credenciales verificadas" className="mt-3 space-y-3">
                      {servicio.prestador.credenciales.map((credencial) => {
                        const oficial = credencial.acreditacion === "REGISTRO_OFICIAL";
                        return (
                          <li key={`${credencial.tipo}-${credencial.verificadaEn ?? ""}`} className="flex gap-3 rounded-medio border border-borde p-4">
                            <span
                              aria-hidden="true"
                              className={`flex size-9 shrink-0 items-center justify-center rounded-chico ${
                                oficial ? "bg-primario text-blanco" : "bg-hielo text-primario"
                              }`}
                            >
                              <Icono nombre="escudo" tamano={20} grosor={2} />
                            </span>
                            <span className="min-w-0 text-sm">
                              <span className="block font-semibold text-noche">{credencial.tipo}</span>
                              <span className="block text-texto-suave">{credencial.emisor}</span>
                              {/* La distinción va en texto, no solo en el color del ícono. */}
                              <span className={`mt-1 block font-medium ${oficial ? "text-primario" : "text-texto-suave"}`}>
                                {oficial
                                  ? "Acreditada con el registro oficial del organismo"
                                  : "Documento revisado por LocalCL (no consultado en un registro oficial)"}
                                {credencial.verificadaEn ? ` · ${fecha.format(new Date(credencial.verificadaEn))}` : ""}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="mt-8 border-t border-borde pt-6">
                  <h2 className="font-titulos text-lg font-bold">Contactar a {servicio.prestador.nombre}</h2>
                  <div className="mt-3">
                    {usuario ? (
                      <BotonWhatsApp servicio={servicio} cliente={cliente} />
                    ) : (
                      <p className="rounded-chico bg-niebla px-4 py-3 text-sm text-noche">
                        Para ver cómo contactarlo,{" "}
                        <Link
                          to="/iniciar-sesion"
                          state={{ desde: `/servicios/${servicio.id}` }}
                          className="font-semibold text-noche underline decoration-cielo decoration-2 underline-offset-2 hover:text-primario"
                        >
                          inicia sesión
                        </Link>{" "}
                        o crea una cuenta. Pedimos sesión para proteger el teléfono de los prestadores.
                      </p>
                    )}
                  </div>
                </section>
              </article>
            )}
          </div>
        </Contenedor>
      </main>
      <Footer />
    </div>
  );
}
