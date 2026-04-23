// components/install-prompt.tsx
// Banner sutil que escucha `beforeinstallprompt` (Android/Chrome/Edge)
// y guarda el evento para lanzarlo al tocar "Instalar app". En iOS el
// evento no existe — mostramos en su lugar una instrucción textual
// para "Añadir a pantalla de inicio" desde Safari.
//
// Se oculta una vez que la app fue instalada o si el usuario lo
// descarta, persistiendo esa elección en localStorage.

"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Tipado mínimo del evento no-estándar.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "lds:install-prompt-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Si el usuario ya dismisseó en una sesión anterior, no volver a molestar.
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1") {
      return;
    }

    // Detectar iOS Safari (no dispara beforeinstallprompt).
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    // En iOS, si ya está en modo standalone, no mostrar nada.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone));
    if (isStandalone) return;

    if (iOS) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage puede estar bloqueado (modo incógnito); ignoramos.
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Instalar aplicación"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Download className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Instalá la app</p>
        <p className="text-muted-foreground">
          {isIOS
            ? "Compartir → Añadir a pantalla de inicio"
            : "Escuchá los cánticos offline en el estadio"}
        </p>
      </div>
      {!isIOS && (
        <Button size="sm" onClick={install} className="shrink-0">
          Instalar
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        onClick={dismiss}
        aria-label="Cerrar"
        className="shrink-0 size-9"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
