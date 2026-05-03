// components/home-search-button.tsx
// Botón "Buscar..." del home. Mismo estilo que tenía el <Link href="/search">
// pero abre el modal de búsqueda en vez de navegar — así el audio que
// suena en el home no se interrumpe por una transición de página.

"use client";

import { Search } from "lucide-react";
import { useSearchModal } from "./search-modal-provider";

interface Props {
  totalCanciones: number;
}

export function HomeSearchButton({ totalCanciones }: Props) {
  const { open } = useSearchModal();
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-12 w-full items-center gap-3 rounded-lg border-2 border-white/20 bg-black/40 px-4 text-left text-[13px] font-semibold uppercase tracking-[0.05em] text-white/50 transition-colors hover:border-[var(--color-verde-neon)] hover:text-white"
    >
      <Search size={18} aria-hidden />
      <span className="flex-1 truncate">
        Buscar en los {totalCanciones} cánticos...
      </span>
    </button>
  );
}
