import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { clienteApi, ErrorApi, type ClienteApi, type PrestadorPublico } from "../api/cliente";
import { ListaCertificaciones, SelloCertificaciones } from "../componentes/Certificaciones";
import { Icono } from "../componentes/iconos";
import { Contenedor } from "../componentes/landing/Contenedor";
import { Footer } from "../componentes/landing/Footer";
import { nombreCategoria, textoPrecio } from "../servicios/formato";

/**
 * /prestadores/:id — perfil público de un prestador: quién es, dónde
 * atiende, sus certificaciones aprobadas y sus servicios publicados.
 *
 * Lo ve cualquiera, sin sesión. Nunca trae teléfono, correo ni RUT (la API
 * no los envía): para contactarlo se entra a uno de sus servicios.
 */
export default function PaginaPrestador({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const [prestador, setPrestador] = useState<PrestadorPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setPrestador(null);
    setError(null);

    cliente
      .obtenerPrestadorPublico(id)
      .then((encontrado) => {
        if (!cancelado) setPrestador(encontrado);
      })
      .catch((causa: unknown) => {
        if (cancelado) return;
        setError(
          causa instanceof ErrorApi && causa.estado === 404
            ? "Este prestador no existe o no tiene servicios publicados."
            : "No fue posible cargar el perfil del prestador.",
        );
      });

    return () => {
      cancelado = true;
    };
  }, [cliente, id]);

  // Con «Ver certificaciones» desde otra página se llega con #certificaciones:
  // la sección existe recién cuando llegan los datos, así que se baja a mano.
  useEffect(() => {
    if (prestador && hash === "#certificaciones") {
      document.getElementById("certificaciones")?.scrollIntoView?.();
    }
  }, [prestador, hash]);

  return (
    <div className="flex flex-1 flex-col bg-niebla font-texto text-noche">
      <main className="grow">
        <Contenedor className="py-10 md:py-16">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div className="rounded-grande border border-borde bg-blanco p-8 text-center">
                <p className="text-lg text-noche">{error}</p>
                <Link to="/buscar" className="mt-4 inline-block font-bold text-primario hover:text-noche">
                  Buscar servicios
                </Link>
              </div>
            )}

            {!error && !prestador && <p className="text-texto-suave">Cargando el perfil…</p>}

            {prestador && (
              <article className="motion-safe:animate-aparecer rounded-grande border border-borde bg-blanco p-6 shadow-tarjeta sm:p-8">
                <p className="text-sm font-bold tracking-[1.2px] text-primario uppercase">Prestador</p>
                <h1 className="mt-2 font-titulos text-[28px] leading-[1.15] font-bold tracking-[-0.5px] break-words md:text-[36px]">
                  {prestador.nombre}
                </h1>
                {prestador.conCertificaciones && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SelloCertificaciones tamano="normal" />
                    <a
                      href="#certificaciones"
                      className="text-sm font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2 hover:text-noche"
                    >
                      Ver certificaciones
                    </a>
                  </div>
                )}

                {prestador.descripcion && (
                  <p className="mt-6 leading-relaxed break-words whitespace-pre-line text-noche">{prestador.descripcion}</p>
                )}

                {prestador.comunas.length > 0 && (
                  <section className="mt-8">
                    <h2 className="font-titulos text-lg font-bold">Comunas donde atiende</h2>
                    <ul aria-label="Comunas donde atiende" className="mt-3 flex flex-wrap gap-2">
                      {prestador.comunas.map((comuna) => (
                        <li key={comuna.id} className="rounded-full border border-borde-fuerte bg-blanco px-3 py-1 text-sm" title={comuna.region}>
                          {comuna.nombre}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section id="certificaciones" aria-labelledby="titulo-certificaciones" className="mt-8 scroll-mt-6">
                  <h2 id="titulo-certificaciones" className="font-titulos text-lg font-bold">
                    Certificaciones
                  </h2>
                  {prestador.certificaciones.length === 0 ? (
                    <p className="mt-2 text-sm text-texto-suave">Este prestador todavía no tiene certificaciones aprobadas.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-texto-suave">
                        Un administrador de LocalCL revisó el documento de cada una antes de publicarla.
                      </p>
                      <ListaCertificaciones certificaciones={prestador.certificaciones} />
                    </>
                  )}
                </section>

                <section aria-labelledby="titulo-servicios" className="mt-8 border-t border-borde pt-6">
                  <h2 id="titulo-servicios" className="font-titulos text-lg font-bold">
                    Servicios
                  </h2>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {prestador.servicios.map((servicio) => (
                      <li key={servicio.id}>
                        <Link
                          to={`/servicios/${servicio.id}`}
                          className="group flex h-full gap-3 rounded-medio border border-borde bg-blanco p-3 transition-colors hover:border-primario focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
                        >
                          {servicio.imagen ? (
                            <img src={servicio.imagen} alt="" loading="lazy" className="size-16 shrink-0 rounded-chico bg-niebla object-cover" />
                          ) : (
                            <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-chico bg-niebla text-borde-fuerte">
                              <Icono nombre="imagen" tamano={24} grosor={1.5} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-primario">{nombreCategoria(servicio)}</span>
                            <span className="block font-semibold break-words text-noche group-hover:text-primario">{servicio.titulo}</span>
                            <span className="mt-0.5 block text-sm text-texto-suave">{textoPrecio(servicio)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-texto-suave">Para contactarlo, entra a uno de sus servicios.</p>
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
