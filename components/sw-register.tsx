// components/sw-register.tsx
// Registra el Service Worker compilado por Serwist en /sw.js una vez
// que la app carga en el cliente. Se monta desde `app/layout.tsx`.
// En dev no hace nada porque Serwist está deshabilitado en ese modo.
//
// Update flow: cuando se detecta un SW nuevo en estado "waiting",
// disparamos un CustomEvent("sw-update-available") que UpdateToast
// escucha. El user toca el toast → postMessage SKIP_WAITING → el SW
// nuevo se activa y recargamos para que tome control.
//
// Anti-loop: cuando el user toca "Actualizar", marcamos un flag en
// sessionStorage. En el próximo load, suprimimos el toast por 10s
// para dar tiempo al SW recién activado a estabilizarse y evitar
// que Safari muestre el toast de nuevo por una "waiting" residual
// del flow de activación que no se limpió a tiempo.

"use client";

import { useEffect } from "react";

const SW_UPDATE_EVENT = "sw-update-available";
const SW_JUST_ACTIVATED_KEY = "sw-just-activated";
// Ventana en ms tras un update donde NO mostramos otro toast aunque
// reg.waiting esté seteado. Cubre la race condition de Safari iOS
// donde el statechange "activated" + clientsClaim + controllerchange
// no llegan exactamente en el orden esperado.
const POST_UPDATE_GRACE_MS = 10_000;

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cleanup: (() => void) | undefined;

    // Lee el timestamp del último update activado y calcula si seguimos
    // dentro de la grace window (no mostrar toast otra vez tan pronto).
    const inGraceWindow = (): boolean => {
      try {
        const raw = sessionStorage.getItem(SW_JUST_ACTIVATED_KEY);
        if (!raw) return false;
        const ts = Number(raw);
        if (!Number.isFinite(ts)) return false;
        const age = Date.now() - ts;
        if (age > POST_UPDATE_GRACE_MS) {
          sessionStorage.removeItem(SW_JUST_ACTIVATED_KEY);
          return false;
        }
        return true;
      } catch {
        return false;
      }
    };

    const maybeDispatchUpdate = () => {
      if (inGraceWindow()) return;
      window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
    };

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // Caso 1: ya hay un SW en waiting al cargar la página (user
        // recargó después de que Serwist instaló la versión nueva en
        // background, pero no se activó porque skipWaiting=false).
        if (reg.waiting && navigator.serviceWorker.controller) {
          maybeDispatchUpdate();
        }

        // Caso 2: durante la sesión actual aparece una nueva versión.
        // `updatefound` dispara cuando el browser detecta cambio; el
        // installing worker pasa por states: installing → installed → ...
        // Cuando llega a "installed" Y existe un controller (o sea,
        // ya había una versión vieja activa), es un update.
        const onUpdateFound = () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              maybeDispatchUpdate();
            }
          });
        };
        reg.addEventListener("updatefound", onUpdateFound);

        // Cuando el nuevo SW efectivamente toma control (después del
        // SKIP_WAITING que dispara UpdateToast), recargar la página
        // para que la UI use los assets nuevos.
        let refreshing = false;
        const onControllerChange = () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        cleanup = () => {
          reg.removeEventListener("updatefound", onUpdateFound);
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };

        // Polling: cada 60s chequear si hay update. Útil para PWAs
        // que el user deja abiertas mucho tiempo (ej: dejó la app
        // mientras escucha música, deployamos un fix, queremos avisar).
        const interval = window.setInterval(() => {
          reg.update().catch(() => {});
        }, 60_000);
        const prevCleanup = cleanup;
        cleanup = () => {
          prevCleanup?.();
          window.clearInterval(interval);
        };
      } catch (err) {
        console.error("[sw] registro fallido", err);
      }
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
      cleanup?.();
    };
  }, []);

  return null;
}

// Helper que dispara UpdateToast cuando el user confirma. Espera a
// que el SW efectivamente cambie a "activated" antes de resolver,
// y marca un flag en sessionStorage para que el ServiceWorkerRegister
// del próximo load suprima el toast por la grace window (evita el
// loop "actualizar -> reload -> toast otra vez" que pasaba en Safari
// iOS por race conditions del activation flow).
export async function activatePendingServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) return;

  // Marcar PRIMERO el flag — antes de que cualquier cosa async pueda
  // disparar otro detect en otra tab / page. Si el activate falla, el
  // grace expira solo en 10s.
  try {
    sessionStorage.setItem(SW_JUST_ACTIVATED_KEY, String(Date.now()));
  } catch {
    /* private mode / storage quota — no critical */
  }

  const waiting = reg.waiting;
  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      waiting.removeEventListener("statechange", onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (waiting.state === "activated" || waiting.state === "redundant") done();
    };
    waiting.addEventListener("statechange", onStateChange);
    waiting.postMessage({ type: "SKIP_WAITING" });
    // Safety: si statechange nunca llega (Safari tiene bugs conocidos),
    // resolver tras 4s para no colgar el flow del UpdateToast.
    setTimeout(done, 4000);
  });
}
