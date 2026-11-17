import { useState } from "react";
import type { FotoPerfil } from "../api/cliente";
import { inicial } from "../servicios/valoraciones";

type Tamano = "chico" | "grande";

const CLASES: Record<Tamano, string> = {
  chico: "size-9 text-sm",
  grande: "size-24 text-3xl",
};

/**
 * La foto de perfil de una cuenta o, si no tiene (o no carga), su inicial.
 *
 * La imagen es decorativa (alt vacío): el nombre siempre está escrito al
 * lado, y un lector de pantalla no gana nada con oír «foto de Ana» antes de
 * «Ana». Se usa la miniatura en los tamaños chicos y la completa en el
 * grande: Cloudinary entrega las dos cuadradas y centradas en la cara.
 */
export function Avatar({ nombre, foto, tamano = "chico" }: { nombre: string; foto: FotoPerfil | null; tamano?: Tamano }) {
  // La URL con que falló: si cambia la foto, se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null);
  const src = foto ? (tamano === "grande" ? foto.url : foto.miniatura) : null;

  if (src && src !== fallida) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFallida(src)}
        className={`${CLASES[tamano]} shrink-0 rounded-full bg-niebla object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${CLASES[tamano]} flex shrink-0 items-center justify-center rounded-full bg-hielo font-titulos font-bold text-primario`}
    >
      {inicial(nombre)}
    </span>
  );
}
