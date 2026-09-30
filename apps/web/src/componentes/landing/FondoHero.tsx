import type { CSSProperties } from "react";
import { Icono, type NombreIcono } from "../iconos";

/*
  Posiciones del diseño (pensado a 1440×800) pasadas a porcentajes, para que
  los adornos acompañen al hero en cualquier ancho en vez de quedar fuera de
  pantalla. El retraso negativo arranca cada animación a mitad de ciclo, así
  no se mueven todas al unísono.

  Los dos primeros puntos caerían sobre el texto cuando el hero es de una
  columna, así que solo aparecen desde lg.
*/
const PUNTOS: { estilo: CSSProperties; soloEscritorio: boolean }[] = [
  { estilo: { left: "44%", top: "15%" }, soloEscritorio: true },
  { estilo: { left: "60%", top: "86%", animationDelay: "-1s" }, soloEscritorio: true },
  { estilo: { left: "94%", top: "11%", animationDelay: "-1.8s" }, soloEscritorio: false },
  { estilo: { left: "4%", top: "95%", animationDelay: "-0.6s" }, soloEscritorio: false },
];

const FLOTANTES: { icono: NombreIcono; grande: boolean; estilo: CSSProperties }[] = [
  { icono: "rayo", grande: true, estilo: { left: "53%", top: "7.5%" } },
  { icono: "martillo", grande: true, estilo: { left: "54%", top: "70%", animationDelay: "-2s" } },
  { icono: "bandeja", grande: true, estilo: { left: "90%", top: "80%", animationDelay: "-4s" } },
  { icono: "gota", grande: false, estilo: { left: "92%", top: "24%", animationDelay: "-3s" } },
  { icono: "llave", grande: false, estilo: { left: "2%", top: "5%", animationDelay: "-1s" } },
];

/**
 * Fondo animado del hero, solo con CSS: una malla de puntos que se desplaza,
 * dos círculos que derivan, puntos de ubicación que laten e íconos de oficios
 * flotando. Todo es decorativo (aria-hidden) y todas las animaciones llevan
 * motion-safe:, así que con "reducir movimiento" el fondo queda quieto.
 *
 * Los íconos flotantes solo aparecen desde lg: en una sola columna caerían
 * encima del texto.
 */
export function FondoHero() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-malla)_1.4px,transparent_1.6px)] bg-size-[28px_28px] opacity-90 motion-safe:animate-malla" />

      <div className="absolute top-[-20%] left-[36%] size-[520px] rounded-full bg-hielo opacity-80 motion-safe:animate-deriva" />
      <div
        className="absolute top-[60%] left-[74%] size-[420px] rounded-full bg-hielo-suave motion-safe:animate-deriva"
        style={{ animationDelay: "-7s" }}
      />

      {PUNTOS.map(({ estilo, soloEscritorio }, i) => (
        <div
          key={i}
          className={`absolute size-[18px] ${soloEscritorio ? "hidden lg:block" : ""}`}
          style={{ left: estilo.left, top: estilo.top }}
        >
          <div
            className="absolute inset-0 rounded-full bg-cielo motion-safe:animate-latido"
            style={{ animationDelay: estilo.animationDelay }}
          />
          <div className="absolute inset-[5px] rounded-full bg-primario" />
        </div>
      ))}

      {FLOTANTES.map(({ icono, grande, estilo }) => (
        <div
          key={icono}
          className={`absolute hidden items-center justify-center bg-blanco text-primario shadow-flotante motion-safe:animate-flotar lg:flex ${
            grande ? "size-14 rounded-medio" : "size-12 rounded-[14px]"
          }`}
          style={estilo}
        >
          <Icono nombre={icono} tamano={grande ? 26 : 22} />
        </div>
      ))}
    </div>
  );
}
