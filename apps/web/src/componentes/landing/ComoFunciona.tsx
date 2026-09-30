import { Revelar } from "../Revelar";
import { Contenedor, Sobretitulo } from "./Contenedor";
import { PASOS } from "./datos";

/** Tres pasos numerados. Es una lista ordenada: el orden es parte del contenido. */
export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-niebla">
      <Contenedor className="flex flex-col gap-14 py-20 md:py-28">
        <Revelar className="flex flex-col items-center gap-3 text-center">
          <Sobretitulo>Cómo funciona</Sobretitulo>
          <h2 className="font-titulos text-[32px] font-bold tracking-[-1px] text-noche md:text-[44px]">
            Resuelve en tres pasos
          </h2>
        </Revelar>

        <ol className="grid gap-6 md:grid-cols-3">
          {PASOS.map((paso, i) => (
            <Revelar como="li" key={paso.titulo} retraso={i * 120} className="flex flex-col gap-4 rounded-grande bg-blanco p-8 md:p-9">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-primario font-titulos text-xl font-bold text-blanco"
              >
                {i + 1}
              </span>
              <h3 className="font-titulos text-2xl font-bold text-noche">{paso.titulo}</h3>
              <p className="text-[17px] leading-[1.55] text-texto-suave">{paso.texto}</p>
            </Revelar>
          ))}
        </ol>
      </Contenedor>
    </section>
  );
}
