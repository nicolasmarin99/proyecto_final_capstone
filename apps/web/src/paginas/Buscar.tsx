import { Link, useSearchParams } from "react-router";
import { Contenedor } from "../componentes/landing/Contenedor";
import { Footer } from "../componentes/landing/Footer";
import { Navbar } from "../componentes/landing/Navbar";

/**
 * Destino del buscador de la landing. La búsqueda real (PostGIS y texto
 * completo en la API) todavía no existe; esta página deja la ruta y sus
 * parámetros fijados (?servicio=...&comuna=...) para que, cuando llegue, solo
 * haya que reemplazar el contenido y no tocar la landing.
 */
export default function PaginaBuscar() {
  const [parametros] = useSearchParams();
  const servicio = parametros.get("servicio");
  const comuna = parametros.get("comuna");

  return (
    <div className="flex min-h-screen flex-col bg-niebla font-texto text-noche">
      <Navbar />
      <main className="grow">
        <Contenedor className="flex flex-col items-start gap-5 py-20 md:py-28">
          <p className="rounded-full bg-hielo px-3.5 py-2 text-sm font-bold text-primario">Próximamente</p>
          <h1 className="font-titulos text-[32px] leading-[1.12] font-bold tracking-[-1px] md:text-[44px]">
            La búsqueda de prestadores está en construcción.
          </h1>
          {(servicio || comuna) && (
            <p className="text-lg text-texto-suave">
              Buscaste
              {servicio && (
                <>
                  {" "}
                  <strong className="text-noche">{servicio}</strong>
                </>
              )}
              {comuna && (
                <>
                  {" "}
                  en <strong className="text-noche">{comuna}</strong>
                </>
              )}
              .
            </p>
          )}
          <p className="max-w-[560px] text-lg leading-[1.55] text-texto-suave">
            Mientras tanto, si ofreces un servicio puedes crear tu perfil y subir tus certificados.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              to="/registro-prestador"
              className="flex h-[52px] items-center rounded-boton bg-primario px-7 font-bold text-blanco transition-colors hover:bg-noche focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
            >
              Publicar mi servicio
            </Link>
            <Link
              to="/"
              className="flex h-[52px] items-center rounded-boton border border-borde-fuerte bg-blanco px-6 font-bold text-primario transition-colors hover:bg-hielo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
            >
              Volver al inicio
            </Link>
          </div>
        </Contenedor>
      </main>
      <Footer />
    </div>
  );
}
