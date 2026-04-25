// components/push-opt-in.tsx
// Card en /perfil para activar notificaciones push.
// Flow:
//   1. Pide permiso con Notification.requestPermission()
//   2. Suscribe al pushManager con la VAPID public key
//   3. POST la suscripción a /api/push/subscribe
//   4. Muestra estado: idle | loading | active | denied
//
// iOS: solo funciona si la PWA está instalada en Home Screen (iOS 16.4+).
// Si el browser detecta standalone=false en iOS, mostramos instrucción.

"use client";

import { useCallback, useEffect, useState } from "react";
// Nota: este componente usa fetch a /api/push/subscribe en vez de
// supabase-js directo, así que no necesita memoizar createClient.
import { Bell, BellOff, Check, Loader2 } from "lucide-react";
import { haptic } from "@/lib/haptic";

// Convierte la VAPID public key (base64url) a ArrayBuffer requerido
// por pushManager.subscribe() (TypeScript DOM lib es estricto con
// Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>).
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

type State = "loading" | "unsupported" | "denied" | "inactive" | "active" | "working";

export function PushOptIn() {
  const [state, setState] = useState<State>("loading");
  const [err, setErr] = useState<string | null>(null);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const check = useCallback(async () => {
    if (typeof window === "undefined") return;
    // Capacitor WebView: Notification y PushManager existen pero
    // pushManager.subscribe con VAPID no entrega push real (Android
    // necesita @capacitor/push-notifications con FCM). Mostrar UI
    // "ACTIVAS" en este contexto sería mentira — ocultar la card.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      setState("unsupported");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "active" : "inactive");
    } catch {
      setState("inactive");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const enable = useCallback(async () => {
    if (!vapidKey) {
      setErr("VAPID no configurado");
      return;
    }
    setState("working");
    setErr(null);
    haptic("tap");

    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
            auth: arrayBufferToBase64(sub.getKey("auth")),
          },
          device_label: navigator.userAgent.slice(0, 100),
        }),
      });
      if (!res.ok) throw new Error("server rejected subscription");

      haptic("double");
      setState("active");
    } catch (e) {
      console.error("[push] enable fail", e);
      setErr("No se pudo activar. Probá más tarde.");
      setState("inactive");
      haptic("error");
    }
  }, [vapidKey]);

  const disable = useCallback(async () => {
    setState("working");
    haptic("tap");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" },
        );
        await sub.unsubscribe();
      }
      setState("inactive");
    } catch {
      setState("inactive");
    }
  }, []);

  if (state === "loading" || state === "unsupported") return null;

  return (
    <section className="mx-5 my-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white"
        >
          {state === "active" ? <Check size={18} className="text-[var(--color-verde-neon)]" /> : <Bell size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">
            NOTIFICACIONES
          </div>
          <div
            className="text-[15px] font-extrabold uppercase text-white"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {state === "active"
              ? "ACTIVAS"
              : state === "denied"
                ? "BLOQUEADAS"
                : "AVISAME DE LOS PARTIDOS"}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] font-medium uppercase leading-snug tracking-[0.03em] text-white/60">
        {state === "active"
          ? "Te avisamos de los partidos, excursiones y cánticos nuevos."
          : state === "denied"
            ? "Activalas desde la config de tu browser → sitio losdelsur.vercel.app → permitir notificaciones."
            : "Activalas y te avisamos si hay partido, excursión o cánticos nuevos."}
      </p>

      {state === "inactive" && (
        <button
          type="button"
          onClick={enable}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
        >
          <Bell size={14} />
          ACTIVAR NOTIFICACIONES
        </button>
      )}

      {state === "active" && (
        <button
          type="button"
          onClick={disable}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-white/20 p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70 hover:border-white/30 hover:text-white"
        >
          <BellOff size={14} />
          DESACTIVAR
        </button>
      )}

      {state === "working" && (
        <div className="mt-3 flex items-center justify-center gap-2 p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70">
          <Loader2 size={14} className="animate-spin" />
          PROCESANDO...
        </div>
      )}

      {err && (
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
          {err}
        </p>
      )}
    </section>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
