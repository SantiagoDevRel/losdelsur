// components/skeleton-row.tsx
// Placeholder shimmer para filas de canción mientras se leen estados
// async (ej. Cache API en /library). Mismas proporciones que SongRow.

export function SkeletonRow() {
  return (
    <div
      className="flex animate-pulse items-center gap-3 border-b border-white/[0.06] px-5 py-3"
      aria-hidden
    >
      <div className="h-5 w-6 rounded bg-white/5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-4 w-3/5 rounded bg-white/10" />
        <div className="h-3 w-1/3 rounded bg-white/5" />
      </div>
      <div className="h-4 w-4 rounded bg-white/5" />
    </div>
  );
}
