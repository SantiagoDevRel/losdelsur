// components/sw-register.tsx
// Registra el Service Worker compilado por Serwist en /sw.js una vez
// que la app carga en el cliente. Se monta desde `app/layout.tsx`.
// En dev no hace nada porque Serwist está deshabilitado en ese modo.

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Registramos tras `load` para no competir con el render inicial.
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.error("[sw] registro fallido", err);
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
