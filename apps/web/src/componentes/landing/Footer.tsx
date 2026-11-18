import { Link } from "react-router";
import { LogoLocalCL } from "../LogoLocalCL";
import { Contenedor } from "./Contenedor";

/*
  Términos y Privacidad llevan al mismo documento (privacidad es su segunda
  parte). Contacto todavía no tiene página: va como texto y no como enlace a
  "#", porque un enlace que no lleva a ningún lado confunde a quien usa lector
  de pantalla o teclado.
*/
const clasesEnlace = "underline-offset-2 hover:text-blanco hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cielo";

export function Footer() {
  return (
    <footer className="border-t border-noche-borde bg-noche text-[15px] text-noche-texto">
      <Contenedor className="flex flex-col items-center gap-6 py-10 text-center md:flex-row md:justify-between md:text-left">
        <LogoLocalCL variante="invertido" tamano={32} claseTexto="text-xl font-bold text-blanco" />
        <ul className="flex gap-7">
          <li>
            <Link to="/terminos" className={clasesEnlace}>
              Términos
            </Link>
          </li>
          <li>
            <Link to="/terminos#privacidad" className={clasesEnlace}>
              Privacidad
            </Link>
          </li>
          <li>Contacto</li>
        </ul>
        <p>© {new Date().getFullYear()} LocalCL</p>
      </Contenedor>
    </footer>
  );
}
