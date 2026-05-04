// components/queue-modal-provider.tsx
// Provider del modal "Ahora suena + Próximas". Mismo patrón que el
// SearchModalProvider para mantener consistencia de UX.

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { QueueModal } from "./queue-modal";

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
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <Ctx.Provider value={{ isOpen, open, close }}>
      {children}
      <QueueModal isOpen={isOpen} onClose={close} />
    </Ctx.Provider>
  );
}
