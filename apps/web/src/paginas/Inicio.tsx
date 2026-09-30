import { CategoriasScroll } from "../componentes/landing/CategoriasScroll";
import { ComoFunciona } from "../componentes/landing/ComoFunciona";
import { CtaFinal } from "../componentes/landing/CtaFinal";
import { Footer } from "../componentes/landing/Footer";
import { Hero } from "../componentes/landing/Hero";
import { Navbar } from "../componentes/landing/Navbar";
import { Prestadores } from "../componentes/landing/Prestadores";

/**
 * Landing de LocalCL. La página solo decide el orden de las secciones; cada
 * una vive en componentes/landing y trae su propio contenido desde datos.ts.
 */
export default function PaginaInicio() {
  return (
    <div className="bg-blanco font-texto text-noche">
      <Navbar />
      <main>
        <Hero />
        <CategoriasScroll />
        <ComoFunciona />
        <Prestadores />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}
