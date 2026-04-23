// components/chip.tsx
// Chip seleccionable estilo rudo: sin border-radius, uppercase, border
// ancho. Usado en la barra de filtros de /cds y /search.

"use client";

interface ChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function Chip({ children, active, onClick }: ChipProps) {
  const neon = "var(--color-verde-neon)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="whitespace-nowrap px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all"
      style={{
        background: active ? neon : "transparent",
        color: active ? "#000" : "#ddd",
        border: active ? `2px solid ${neon}` : "2px solid rgba(255,255,255,0.18)",
      }}
    >
      {children}
    </button>
  );
}
