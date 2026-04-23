// components/section-header.tsx
// Encabezado de sección con subrayado verde neón (idéntico al handoff).
// Acepta una acción opcional (típicamente un link "Ver todo →").

import Link from "next/link";

interface SectionHeaderProps {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  // Cuando el título contiene mezcla de may/mins que hay que preservar
  // (ej. "CDs"), pasá true para que NO se uppercase via CSS.
  preserveCase?: boolean;
}

export function SectionHeader({
  title,
  actionHref,
  actionLabel = "Ver todo →",
  preserveCase,
}: SectionHeaderProps) {
  return (
    <div className="mb-3.5 flex items-end justify-between px-5">
      <div>
        <div
          className={preserveCase ? "text-white" : "uppercase text-white"}
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 22,
            lineHeight: 1,
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </div>
        <div
          aria-hidden
          className="mt-1.5 h-[3px] w-10"
          style={{ background: "var(--color-verde-neon)" }}
        />
      </div>
      {actionHref && (
        <Link
          href={actionHref}
          className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60 hover:text-white"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
