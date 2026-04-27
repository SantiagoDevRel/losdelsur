// components/admin/bar-list.tsx
// Lista con barra horizontal que muestra el ratio de cada item al max.
// Compartido entre /admin (home) y /admin/analytics.

export function BarList({
  items,
  max,
}: {
  items: { label: string; value: number }[];
  max: number;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <li
            key={item.label}
            className="relative overflow-hidden rounded-lg border-2 border-white/10 bg-white/5 p-2.5"
          >
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 bg-[var(--color-verde-neon)]/15"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between gap-2">
              <span
                className="truncate text-[12px] font-extrabold uppercase tracking-[0.04em] text-white"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[12px] font-extrabold uppercase tracking-[0.05em] text-[var(--color-verde-neon)]">
                {item.value.toLocaleString("es-CO")}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
