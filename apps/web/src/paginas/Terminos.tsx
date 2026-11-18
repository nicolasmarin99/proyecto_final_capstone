import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { clienteApi, type ClienteApi, type Terminos } from "../api/cliente";
import { clasesBoton } from "../componentes/Boton";
import { DocumentoLegal } from "../componentes/DocumentoLegal";
import { Contenedor } from "../componentes/landing/Contenedor";
import { Footer } from "../componentes/landing/Footer";

/**
 * /terminos: los términos y condiciones y la política de privacidad, en la
 * versión vigente. Pública: se lee antes de crear la cuenta. Se puede
 * imprimir o guardar como PDF desde el navegador.
 */
export default function PaginaTerminos({ cliente = clienteApi }: { cliente?: ClienteApi }) {
  const { hash } = useLocation();
  const [terminos, setTerminos] = useState<Terminos | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    cliente
      .obtenerTerminosVigentes()
      .then((vigentes) => {
        if (!cancelado) setTerminos(vigentes);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente]);

  // Llegando a /terminos#privacidad: React Router no baja solo hasta el ancla.
  useEffect(() => {
    if (terminos && hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "start" });
  }, [terminos, hash]);

  return (
    <div className="flex flex-1 flex-col bg-niebla font-texto text-noche">
      <main className="grow">
        <Contenedor className="py-10 md:py-16">
          <article className="mx-auto max-w-3xl rounded-grande border border-borde bg-blanco p-6 shadow-tarjeta sm:p-10 print:border-0 print:p-0 print:shadow-none">
            {error && (
              <>
                <h1 className="font-titulos text-titulo font-bold text-noche">Términos y condiciones</h1>
                <p role="alert" className="mt-4 text-noche">
                  No fue posible cargar los términos. Intenta de nuevo en unos minutos.
                </p>
              </>
            )}
            {!error && !terminos && <p className="text-texto-suave">Cargando los términos…</p>}
            {terminos && (
              <>
                <nav aria-label="Partes del documento" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm print:hidden">
                  <a href="#terminos" className="font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2 hover:text-noche">
                    Términos y condiciones
                  </a>
                  <a href="#privacidad" className="font-semibold text-primario underline decoration-cielo decoration-2 underline-offset-2 hover:text-noche">
                    Política de privacidad
                  </a>
                </nav>
                <DocumentoLegal contenido={terminos.contenido} />
                <div className="mt-10 flex flex-col gap-3 border-t border-borde pt-6 sm:flex-row print:hidden">
                  <button type="button" onClick={() => window.print()} className={`cursor-pointer sm:w-auto sm:px-6 ${clasesBoton("secundario")}`}>
                    Imprimir o guardar como PDF
                  </button>
                  <Link to="/" className={`sm:w-auto sm:px-6 ${clasesBoton("secundario")}`}>
                    Volver al inicio
                  </Link>
                </div>
              </>
            )}
          </article>
        </Contenedor>
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
