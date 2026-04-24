// capacitor.config.ts
// Config de Capacitor para envolver la PWA como app Android nativa.
//
// Estrategia: la app corre desde Vercel (no build local) — el APK es
// un thin wrapper WebView apuntando a la URL de producción. Esto:
//  - Evita mantener `next export` static (la PWA usa server routes:
//    /auth/callback, proxy.ts refresh, OG dinámico, Supabase SSR).
//  - Cada feature nueva se deploya a Vercel y la app mobile la "hereda"
//    sin rebuilder el APK.
//  - Desventaja: sin conexión al primer arranque, la app queda
//    estancada en el splash. Pero como es PWA con Service Worker,
//    después del primer uso funciona offline normal.
//
// Para BUILD LOCAL (dev en emulador sin red), comentá `server.url`
// y usá `webDir: "out"` después de `npx next build && next export`.

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.losdelsur.app",
  appName: "Los Del Sur",
  webDir: "public",

  // Wrapper de la PWA deployada a Vercel. Si cambiás de dominio,
  // actualizá acá + en la allowNavigation.
  server: {
    url: "https://los-del-sur-app.vercel.app",
    cleartext: false,
    allowNavigation: [
      "los-del-sur-app.vercel.app",
      "*.supabase.co", // OAuth callback de Google + email magic link
      "accounts.google.com", // Google sign-in flow
    ],
  },

  android: {
    // Allow backup del app data cuando el user hace Google backup.
    allowMixedContent: false,
    backgroundColor: "#000000",
    // Webview config — oscurecer backgrounds pre-load para que no
    // flashee blanco entre splash y home.
  },

  // Splash screen — coincide con el theme verde/negro del app.
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
