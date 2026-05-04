// components/install-card.tsx
// Card de instalación de la PWA con botón directo cuando se puede.
//
// Capacidades por plataforma:
//   - Android / Chrome / Edge → dispara el prompt nativo del sistema,
//     instalación 1-click. Si el evento `beforeinstallprompt` no se
//     disparó aún (Chrome lo retiene hasta detectar "engagement"),
//     revelamos un hint corto con el camino por el menú del navegador.
//   - iOS Safari → Apple NO permite instalación programática vía API.
//     Mostramos un popup compacto con la instrucción visual (Compartir
//     → Añadir a pantalla de inicio). No hay forma de evitar ese paso.
//   - Ya instalada → check verde + botón de "Buscar actualización"
//     que llama a `registration.update()` sobre el Service Worker.
//
// Imaginería: usa `/install-art/install.webp` (un solo asset compartido
// para iOS y Android — antes había duplicado de PNG, ahora 1 webp).
// (cuadradas, más legibles que el logo circular normal).

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Download, RefreshCw, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "unknown" | "ios" | "ios-other" | "android" | "desktop";

export function InstallCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [busy, setBusy] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  // Overlay de ayuda para iOS / Android-sin-prompt (se abre al tocar instalar).
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const isAndroid = /Android/.test(ua);
    // En iOS solo Safari permite "Añadir a pantalla de inicio". Los
    // demás navegadores (Chrome/Firefox/Edge) usan WebKit por
    // obligación de Apple, pero no exponen la opción. CriOS=Chrome,
    // FxiOS=Firefox, EdgiOS=Edge en iOS.
    const isIOSOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    setPlatform(
      isIOSOtherBrowser ? "ios-other" : isIOS ? "ios" : isAndroid ? "android" : "desktop",
    );

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as { standalone?: boolean }).standalone));
    setInstalled(standalone);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Click principal: intenta 1-click, si no se puede abre la ayuda.
  async function handleInstallClick() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    // Sin evento → mostramos el overlay con la instrucción mínima
    // (iOS siempre cae acá; Android cae si Chrome aún no disparó
    // beforeinstallprompt).
    setHelpOpen(true);
  }

  async function checkUpdates() {
    if (!("serviceWorker" in navigator)) {
      setUpdateMsg("Este navegador no soporta Service Workers.");
      return;
    }
    setBusy(true);
    setUpdateMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setUpdateMsg("La app no está en modo offline todavía.");
        return;
      }
      await reg.update();
      setUpdateMsg(
        "Busqué actualizaciones. Si hay versión nueva, se aplica al reabrir la app.",
      );
    } catch {
      setUpdateMsg("No se pudo verificar ahora. Volvé a intentar.");
    } finally {
      setBusy(false);
    }
  }

  // Estado: ya instalada → check de updates
  if (installed) {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <Check size={18} className="text-[var(--color-verde-neon)]" />
          <Eyebrow>APP INSTALADA</Eyebrow>
        </div>
        <Title>TENÉS LA ÚLTIMA</Title>
        <Body>
          Si agregamos cánticos nuevos o mejoras, se actualizan solas la
          próxima vez que abras la app con internet. Si querés forzar un
          chequeo ahora:
        </Body>
        <button
          type="button"
          onClick={checkUpdates}
          disabled={busy}
          className="btn-ghost-rudo mt-4 inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
          {busy ? "BUSCANDO..." : "BUSCAR ACTUALIZACIÓN"}
        </button>
        {updateMsg && (
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.05em] text-white/50">
            {updateMsg}
          </p>
        )}
      </Card>
    );
  }

  // --- No instalada: card con botón directo ---

  // Mismo arte para iOS y Android (era el mismo PNG duplicado, ahora
  // unificado en un único webp 9× más liviano: 332KB -> 36KB). Desktop
  // sigue cayendo al logo default.
  const art =
    platform === "ios" || platform === "ios-other" || platform === "android"
      ? "/install-art/install.webp"
      : "/logo.png";

  // En iOS con browser que NO es Safari, la instalación es imposible
  // — ni siquiera mostrando instrucciones. Hay que cambiar de browser.
  // Ofrecemos copiar el link para que lo peguen en Safari.
  async function copyLinkForSafari() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setUpdateMsg("Link copiado. Pegalo en Safari.");
    } catch {
      setUpdateMsg("No pude copiar. Abrí Safari y entrá a los-del-sur-app.vercel.app");
    }
  }

  if (platform === "ios-other") {
    return (
      <Card>
        <div className="flex items-center gap-4">
          <Image src={art} alt="" width={72} height={72} className="shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <Eyebrow>ABRÍ EN SAFARI</Eyebrow>
            <Title>NO EN CHROME</Title>
          </div>
        </div>
        <Body>
          Apple solo permite instalar apps desde Safari en iPhone. Si estás en
          Chrome, Firefox o Edge, no vas a poder añadirla a la pantalla de
          inicio.
        </Body>
        <button
          type="button"
          onClick={copyLinkForSafari}
          className="btn-primary-rudo mt-4 inline-flex items-center gap-2"
        >
          <Download size={16} />
          COPIAR LINK PARA SAFARI
        </button>
        {updateMsg && (
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.05em] text-white/60">
            {updateMsg}
          </p>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-4">
          <Image
            src={art}
            alt=""
            width={72}
            height={72}
            className="shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <Eyebrow>INSTALAR LA APP</Eyebrow>
            <Title>TENELA EN TU CELU</Title>
          </div>
        </div>
        <Body>
          Fullscreen como app nativa, funciona offline, ícono en tu home
          screen.
        </Body>
        <button
          type="button"
          onClick={handleInstallClick}
          className="btn-primary-rudo mt-4 inline-flex items-center gap-2"
        >
          <Download size={16} />
          INSTALAR APP
        </button>
      </Card>

      {/* Overlay de ayuda cuando no hay prompt disponible.
          iOS siempre necesita este paso — Apple no deja instalar PWAs
          vía API. Android cae acá solo si Chrome todavía no disparó
          beforeinstallprompt. */}
      {helpOpen && (
        <HelpOverlay platform={platform} onClose={() => setHelpOpen(false)} />
      )}
    </>
  );
}

// --- Overlay de ayuda ---

function HelpOverlay({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative m-3 w-full max-w-md rounded-2xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-2 top-2 grid size-9 place-items-center text-white/60 hover:text-white"
        >
          <X size={18} />
        </button>

        {platform === "ios" ? (
          <>
            <Eyebrow>UN SEGUNDO NOMÁS</Eyebrow>
            <Title>DESDE SAFARI:</Title>
            <ol className="mt-3 flex flex-col gap-2 text-[13px] font-medium uppercase tracking-[0.03em] text-white/80">
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center bg-[var(--color-verde-neon)] text-black">
                  1
                </span>
                Tocá <Share size={14} className="inline" /> (Compartir)
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center bg-[var(--color-verde-neon)] text-black">
                  2
                </span>
                &ldquo;Añadir a pantalla de inicio&rdquo;
              </li>
            </ol>
            <p className="mt-3 text-[11px] text-white/50">
              iOS no permite instalar con un solo toque. Es cosa de Apple, no
              nuestra.
            </p>
          </>
        ) : (
          <>
            <Eyebrow>UN SEGUNDO NOMÁS</Eyebrow>
            <Title>DESDE CHROME:</Title>
            <ol className="mt-3 flex flex-col gap-2 text-[13px] font-medium uppercase tracking-[0.03em] text-white/80">
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center bg-[var(--color-verde-neon)] text-black">
                  1
                </span>
                Menú <span className="font-bold">⋮</span> arriba a la derecha
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center bg-[var(--color-verde-neon)] text-black">
                  2
                </span>
                &ldquo;Instalar app&rdquo; (o &ldquo;Añadir a pantalla de
                inicio&rdquo;)
              </li>
            </ol>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-ghost-rudo mt-5 w-full"
        >
          ENTENDIDO
        </button>
      </div>
    </div>
  );
}

// --- primitivos internos (estilo "rudo") ---

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative mx-5 my-5 overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ background: "var(--color-verde-neon)" }}
      />
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-1 uppercase text-white"
      style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
    >
      {children}
    </h3>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.03em] text-white/70">
      {children}
    </p>
  );
}
