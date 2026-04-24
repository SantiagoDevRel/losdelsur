// app/perfil/perfil-view.tsx
// Vista de perfil "híbrida":
//  - Sin login → hero con CTA "Entrá con Google" + install + cache + créditos
//  - Con login → hero con avatar, username/ciudad/combo, link a logout,
//               + install + cache + créditos
//
// Reemplaza a la antigua /settings. El tab-bar ahora apunta acá.

"use client";

import Image from "next/image";
import Link from "next/link";
import { LogIn, LogOut, MapPin, Users } from "lucide-react";
import { CacheManager } from "@/components/cache-manager";
import { CreditsFooter } from "@/components/credits-footer";
import { InstallCard } from "@/components/install-card";
import { useUser } from "@/components/user-provider";
import { haptic } from "@/lib/haptic";

export function PerfilView() {
  const { user, profile, loading } = useUser();

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">APP · VERSIÓN 0.2</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 48, lineHeight: 0.85 }}
        >
          PERFIL
        </h1>
      </header>

      {/* Hero: varia según logueado o no */}
      {loading ? (
        <HeroSkeleton />
      ) : user ? (
        <LoggedInHero
          email={user.email ?? ""}
          username={profile?.username ?? null}
          ciudad={profile?.ciudad ?? null}
          combo={profile?.combo ?? null}
          avatarUrl={profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null}
        />
      ) : (
        <LoggedOutHero />
      )}

      <InstallCard />

      <CacheManager />

      <CreditsFooter variant="full" />
    </main>
  );
}

// --- Subcomponentes ---

function HeroSkeleton() {
  return (
    <section className="flex flex-col items-center px-5 py-6">
      <div className="size-32 animate-pulse rounded-full bg-white/5" />
      <div className="mt-4 h-4 w-24 animate-pulse bg-white/5" />
    </section>
  );
}

function LoggedOutHero() {
  return (
    <section className="mx-5 my-5 overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-1.5"
        style={{ background: "var(--color-verde-neon)" }}
      />
      <div className="flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="Logo de Los Del Sur"
          width={140}
          height={140}
          priority
          className="rounded-full"
        />
        <div className="eyebrow mt-4">¿YA SOS SUREÑO?</div>
        <h3
          className="mt-1 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 26, lineHeight: 1 }}
        >
          GUARDÁ TU PARCHE
          <br />
          EN LA NUBE
        </h3>
        <p className="mt-2 max-w-sm text-[12px] font-medium uppercase leading-snug tracking-[0.03em] text-white/60">
          Favoritas, descargas y plays sincronizados entre celus. Si lo
          cambiás, no perdés nada.
        </p>
        <Link
          href="/login?next=/perfil"
          onClick={() => haptic("tap")}
          className="btn-primary-rudo mt-4 inline-flex items-center gap-2"
        >
          <LogIn size={16} />
          ENTRAR
        </Link>
      </div>
    </section>
  );
}

function LoggedInHero({
  email,
  username,
  ciudad,
  combo,
  avatarUrl,
}: {
  email: string;
  username: string | null;
  ciudad: string | null;
  combo: string | null;
  avatarUrl: string | null;
}) {
  return (
    <section className="flex flex-col items-center px-5 py-6">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt="Tu avatar"
          width={140}
          height={140}
          unoptimized
          className="rounded-full border-2 border-[var(--color-verde-neon)]"
        />
      ) : (
        <Image
          src="/logo.png"
          alt="Logo de Los Del Sur"
          width={140}
          height={140}
          priority
          className="rounded-full border-2 border-[var(--color-verde-neon)]"
        />
      )}

      <p
        className="mt-4 text-center uppercase text-white"
        style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 24, lineHeight: 1 }}
      >
        {username || email.split("@")[0]}
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
        {email}
      </p>

      {/* Ciudad + combo */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {ciudad && (
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/80">
            <MapPin size={12} />
            {ciudad}
          </div>
        )}
        {combo && (
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]">
            <Users size={12} />
            {combo}
          </div>
        )}
      </div>

      {/* Logout */}
      <form action="/auth/sign-out" method="post" className="mt-5">
        <button
          type="submit"
          onClick={() => haptic("tap")}
          className="flex items-center gap-1.5 rounded-lg border-2 border-white/15 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70 hover:border-white/30 hover:text-white"
        >
          <LogOut size={12} />
          CERRAR SESIÓN
        </button>
      </form>
    </section>
  );
}
