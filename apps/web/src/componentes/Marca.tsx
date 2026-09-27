/**
 * Escudo con visto bueno: la verificación de credenciales es la propuesta de
 * valor, así que la marca la muestra en vez de solo nombrarla.
 */
export function Marca({ tono = "oscuro" }: { tono?: "claro" | "oscuro" }) {
  const colorTexto = tono === "claro" ? "text-white" : "text-marca-900";
  const colorEscudo = tono === "claro" ? "stroke-acento-400" : "stroke-marca-900";

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorEscudo}
        aria-hidden="true"
      >
        <path d="M12 2l8 3.5v5.8c0 4.9-3.3 8.9-8 10.2-4.7-1.3-8-5.3-8-10.2V5.5z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span className={`font-display text-xl font-semibold tracking-tight ${colorTexto}`}>
        LocalCL
      </span>
    </div>
  );
}
