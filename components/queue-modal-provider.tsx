// components/queue-modal-provider.tsx
// Provider del modal "Ahora suena + Próximas". Mismo patrón que el
// SearchModalProvider para mantener consistencia de UX.
//
// Lazy-loadeado con dynamic: el chunk con @dnd-kit (~30KB) sólo viaja
// la primera vez que el user abre la queue.

"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

const QueueModal = dynamic(
  () => import("./queue-modal").then((m) => ({ default: m.QueueModal })),
  { ssr: false },
);

interface QueueModalContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const Ctx = createContext<QueueModalContextValue | null>(null);

export function useQueueModal(): QueueModalContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQueueModal must be used inside QueueModalProvider");
  return v;
}

export function QueueModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const open = useCallback(() => {
    setMounted(true);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <Ctx.Provider value={{ isOpen, open, close }}>
      {children}
      {mounted && <QueueModal isOpen={isOpen} onClose={close} />}
    </Ctx.Provider>
  );
}
