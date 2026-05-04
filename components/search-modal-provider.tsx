// components/search-modal-provider.tsx
// Provider del modal de búsqueda. Vive arriba del layout para que el
// modal sea accesible desde cualquier pantalla sin necesidad de
// navegar a /search. Mantiene el audio sonando porque el AudioPlayer
// envuelve el árbol entero.
//
// El componente del modal se lazy-loadea con dynamic + se monta sólo
// cuando el user lo abre por primera vez. Saca su chunk del bundle
// inicial.

"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { CD } from "@/lib/types";

const SearchModal = dynamic(
  () => import("./search-modal").then((m) => ({ default: m.SearchModal })),
  { ssr: false },
);

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
  // mounted: una vez que se abre la primera vez, dejamos el componente
  // montado para que la 2da apertura sea instantánea (sin re-fetch del
  // chunk). Si nunca se abre, ni baja el chunk.
  const [mounted, setMounted] = useState(false);
  const open = useCallback(() => {
    setMounted(true);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <Ctx.Provider value={{ isOpen, open, close }}>
      {children}
      {mounted && <SearchModal cds={cds} isOpen={isOpen} onClose={close} />}
    </Ctx.Provider>
  );
}
