import { LogoLocalCL } from "../LogoLocalCL";
import { Contenedor } from "./Contenedor";

/*
  Términos, Privacidad y Contacto todavía no tienen página. Van como texto y
  no como enlaces a "#": un enlace que no lleva a ningún lado confunde a quien
  usa lector de pantalla o teclado. Cuando existan las páginas, pasan a Link.
*/
const LEGALES = ["Términos", "Privacidad", "Contacto"];

export function Footer() {
  return (
    <footer className="border-t border-noche-borde bg-noche text-[15px] text-noche-texto">
      <Contenedor className="flex flex-col items-center gap-6 py-10 text-center md:flex-row md:justify-between md:text-left">
        <LogoLocalCL variante="invertido" tamano={32} claseTexto="text-xl font-bold text-blanco" />
        <ul className="flex gap-7">
          {LEGALES.map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
        <p>© {new Date().getFullYear()} LocalCL</p>
      </Contenedor>
    </footer>
  );
}
