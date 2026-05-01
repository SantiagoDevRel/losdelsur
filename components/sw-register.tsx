// components/sw-register.tsx
// Registra el Service Worker compilado por Serwist en /sw.js una vez
// que la app carga en el cliente. Se monta desde `app/layout.tsx`.
// En dev no hace nada porque Serwist está deshabilitado en ese modo.
//
// Update flow: cuando se detecta un SW nuevo en estado "waiting",
// disparamos un CustomEvent("sw-update-available") que UpdateToast
// escucha. El user toca el toast → postMessage SKIP_WAITING → el SW
// nuevo se activa y recargamos para que tome control.

"use client";

import { useEffect } from "react";

const SW_UPDATE_EVENT = "sw-update-available";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cleanup: (() => void) | undefined;

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // Caso 1: ya hay un SW en waiting al cargar la página (user
        // recargó después de que Serwist instaló la versión nueva en
        // background, pero no se activó porque skipWaiting=false).
        if (reg.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
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
              window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
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

// Helper que dispara UpdateToast cuando el user confirma. Puesto
// acá para que el toast no necesite importar todo este módulo, solo
// la función.
export async function activatePendingServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) return;
  reg.waiting.postMessage({ type: "SKIP_WAITING" });
  // El controllerchange listener en ServiceWorkerRegister hace el reload.
}
