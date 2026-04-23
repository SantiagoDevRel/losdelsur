// app/settings/page.tsx
// Pantalla Ajustes: créditos + info de la app + gestión de descargas
// offline (cuántas canciones hay cacheadas y botón para borrarlas).

import Image from "next/image";
import { CacheManager } from "@/components/cache-manager";
import { CreditsFooter } from "@/components/credits-footer";
import { InstallCard } from "@/components/install-card";

export const metadata = { title: "Ajustes — La Banda Los Del Sur" };

export default function SettingsPage() {
  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">APP · VERSIÓN 0.1</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 48, lineHeight: 0.85 }}
        >
          AJUSTES
        </h1>
      </header>

      <section className="flex flex-col items-center px-5 py-6">
        {/* Logo oficial tight-cropped con fondo blanco, clipeado
            circular para que quede como un badge. */}
        <Image
          src="/logo.png"
          alt="Logo de Los Del Sur"
          width={200}
          height={200}
          priority
          className="rounded-full"
        />
        <p
          className="mt-4 text-center uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
        >
          LOS DEL SUR
        </p>
        <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">
          CANCIONERO OFICIAL · SINCE 1997
        </p>
      </section>

      <InstallCard />

      <CacheManager />

      <CreditsFooter variant="full" />
    </main>
  );
}
