// app/search/search-view.tsx
// Buscador cliente con Fuse.js. Input grande estilo rudo + lista de
// resultados con `SongRow`.

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { createSearchIndex, searchCanciones } from "@/lib/search";
import type { Cancion } from "@/lib/types";
import { SongRow } from "@/components/song-row";
import { CreditsFooter } from "@/components/credits-footer";

interface Props {
  canciones: Cancion[];
}

export function SearchView({ canciones }: Props) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const fuse = useMemo(() => createSearchIndex(canciones), [canciones]);

  // Debounce 150ms.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(raw), 150);
    return () => clearTimeout(handle);
  }, [raw]);

  const results = useMemo(() => searchCanciones(fuse, canciones, query), [fuse, canciones, query]);

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">CANCIONERO COMPLETO</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 48, lineHeight: 0.85 }}
        >
          BUSCAR
        </h1>
      </header>

      <div className="px-5 pb-4">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            size={18}
            aria-hidden
          />
          <input
            type="search"
            inputMode="search"
            autoFocus
            placeholder="CÁNTICO, LETRA, ARTISTA..."
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Buscar cántico"
            className="h-12 w-full rounded-lg border-2 border-white/20 bg-black pl-10 pr-3 text-[14px] font-semibold uppercase tracking-[0.05em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
      </div>

      {query.trim() === "" ? (
        <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
          Buscá por título, letra o canción original.
        </p>
      ) : results.length === 0 ? (
        <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
          Nada encontrado para &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <section>
          {results.map((c, i) => (
            <SongRow key={c.id} cancion={c} index={i + 1} />
          ))}
        </section>
      )}
      <CreditsFooter />
    </main>
  );
}
