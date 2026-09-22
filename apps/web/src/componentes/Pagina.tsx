import type { ReactNode } from "react";

/** Tarjeta centrada que comparten todas las pantallas. */
export function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">LocalCL</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
