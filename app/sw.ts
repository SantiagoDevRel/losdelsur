// app/sw.ts
// Service Worker construido con Serwist (wrapper moderno de Workbox
// integrado con Next). Responsabilidades:
//   1. Precachear los assets de build (páginas estáticas, JS/CSS,
//      íconos, manifest, JSON de canciones bundleado).
//   2. Servir audio con estrategia CacheFirst y cache propio
//      ("lds-audio-v1") para que coincida con el que el botón
//      "descargar" popula manualmente vía Cache API.
//   3. Fallback offline a la home.
//
// Este archivo se compila a /public/sw.js por @serwist/next y se
// registra automáticamente desde el cliente.

/// <reference lib="WebWorker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, Serwist } from "serwist";

// Tipado del scope global del worker.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Fallback offline a "/" cuando la navegación falla sin red.
  fallbacks: {
    entries: [
      {
        url: "/",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
  runtimeCaching: [
    // Audio: cache-first en su propio cache nombrado.
    {
      matcher: ({ request, url }) =>
        request.destination === "audio" || url.pathname.startsWith("/audio/"),
      handler: new CacheFirst({
        cacheName: "lds-audio-v1",
      }),
    },
    // Covers de CDs: cache-first largo (las .jpg no cambian mucho).
    {
      matcher: ({ url }) => url.pathname.startsWith("/covers/"),
      handler: new CacheFirst({ cacheName: "lds-covers-v1" }),
    },
    // Imágenes optimizadas de next/image: cache-first.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/image"),
      handler: new CacheFirst({ cacheName: "lds-img-opt-v1" }),
    },
    // Video ambient + poster: cache-first.
    {
      matcher: ({ url }) => url.pathname.startsWith("/design-assets/"),
      handler: new CacheFirst({ cacheName: "lds-design-assets-v1" }),
    },
    // Resto: defaults razonables de Serwist (páginas, imágenes, etc.).
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// --- Web Push listener ---
// Cuando el server dispara webpush.sendNotification(), este evento llega.
// El payload (JSON serializado) trae title/body/url/icon.

self.addEventListener("push", (event: PushEvent) => {
  let data: { title: string; body: string; url?: string; icon?: string } = {
    title: "La Banda Los Del Sur",
    body: "Abrí la app",
  };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as typeof data) };
  } catch {
    /* payload no es JSON, usamos defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
      // `tag` colapsa notifs repetidas. `renotify` existe en la
      // plataforma pero los types de lib.dom no lo exponen; lo
      // pasamos con cast.
      tag: "lds-push",
      ...({ renotify: true } as Record<string, unknown>),
    }),
  );
});

// Click en la notificación → focus/abrir la app en el URL adjunto.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si hay una ventana abierta del sitio, enfocarla y navegar.
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(url);
          return;
        }
      }
      // Ninguna ventana abierta → abrir una nueva.
      await self.clients.openWindow(url);
    })(),
  );
});
