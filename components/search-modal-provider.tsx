// components/search-modal-provider.tsx
// Provider del modal de búsqueda. Vive arriba del layout para que el
// modal sea accesible desde cualquier pantalla sin necesidad de
// navegar a /search. Mantiene el audio sonando porque el AudioPlayer
// envuelve el árbol entero.

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { CD } from "@/lib/types";
import { SearchModal } from "./search-modal";

interface SearchModalContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const Ctx = createContext<SearchModalContextValue | null>(null);

export function useSearchModal(): SearchModalContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSearchModal must be used inside SearchModalProvider");
  return v;
}

export function SearchModalProvider({
  cds,
  children,
}: {
  cds: CD[];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <Ctx.Provider value={{ isOpen, open, close }}>
      {children}
      <SearchModal cds={cds} isOpen={isOpen} onClose={close} />
    </Ctx.Provider>
  );
}
