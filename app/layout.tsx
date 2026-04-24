// app/layout.tsx
// Layout raíz de la PWA. Renderiza:
//   - <SplashGate/> (overlay de bienvenida, solo primera vez por sesión)
//   - children (la pantalla activa)
//   - <TabBar/> (navegación inferior fija)
//   - <InstallPrompt/> (banner para instalar en mobile)
//   - <ServiceWorkerRegister/> (registro del SW compilado por Serwist)

import type { Metadata, Viewport } from "next";
import { Anton, Barlow_Condensed, Bebas_Neue, Permanent_Marker } from "next/font/google";
import "./globals.css";
import NextTopLoader from "nextjs-toploader";
import { InstallPrompt } from "@/components/install-prompt";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { TabBar } from "@/components/tab-bar";
import { AmbientVideo } from "@/components/ambient-video";
import { AudioPlayerProvider } from "@/components/audio-player-provider";
import { GlobalMiniPlayer } from "@/components/global-mini-player";
import { UserProvider } from "@/components/user-provider";
import { RegisterGate } from "@/components/register-gate";
import { SyncManager } from "@/components/sync-manager";
import { getAllCDs } from "@/lib/content";

// Fuentes auto-hosteadas: Next las descarga en build y las sirve
// desde nuestro propio dominio con preload automático.
// Resultado: zero FOUT, una sola request, cacheadas agresivamente.
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const barlow = Barlow_Condensed({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});
const marker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marker",
  display: "swap",
});

const NACIONAL_GREEN = "#006837";

export const metadata: Metadata = {
  title: "La Banda Los Del Sur",
  description:
    "Cancionero oficial de la barra Los Del Sur: letras y audio offline para el día de partido.",
  applicationName: "La Banda Los Del Sur",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Los Del Sur",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon-167.png", sizes: "167x167" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: NACIONAL_GREEN,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Catálogo completo para que el player global sepa todas las
  // canciones (necesario para shuffle "all").
  const catalog = getAllCDs();
  return (
    <html
      lang="es"
      className={`h-full antialiased ${anton.variable} ${barlow.variable} ${bebas.variable} ${marker.variable}`}
    >
      {/* NO ponemos bg-black aquí: taparía el video ambient. El negro
          viene del <html> vía globals.css, que actúa como fallback
          detrás del video. */}
      <body className="relative min-h-full text-white">
        {/* Top progress bar: barra verde neón arriba durante
            navegaciones >300ms. Se auto-esconde si es rápida. */}
        <NextTopLoader
          color="#2BFF7F"
          height={2}
          showSpinner={false}
          speed={240}
          crawl
        />
        {/* Ambient video del humo de la tribuna en todas las pantallas. */}
        <AmbientVideo />
        {/* UserProvider arriba: necesitamos el user/profile en todos
            los componentes (tab-bar, song-row, etc.) para sync con
            Supabase. RegisterGate bloquea con modal si el user está
            logueado pero sin ciudad seteada (flow de primer registro). */}
        <UserProvider>
          {/* AudioPlayerProvider envuelve TODO: el <audio> vive dentro,
              persiste entre cambios de ruta. La Media Session API se
              conecta ahí para background playback en iOS/Android. */}
          <AudioPlayerProvider catalog={catalog}>
            {/* z-10 para que las páginas pinten POR ENCIMA del video fixed
                (que está en z-0). El <html> tiene fondo negro como fallback. */}
            <div className="relative z-10">{children}</div>
            <GlobalMiniPlayer />
            <TabBar />
            <InstallPrompt />
            <RegisterGate />
            <SyncManager />
          </AudioPlayerProvider>
        </UserProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
