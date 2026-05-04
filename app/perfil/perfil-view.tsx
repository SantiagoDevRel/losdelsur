// app/perfil/perfil-view.tsx
// "Perfil Sureño" — carnet digital + pasaporte verde + puntos unificados.
//
//   - Sin login → hero con CTA "Entrá al parche" + install + cache + créditos
//   - Con login → carnet (apodo, combo, barrio, ciudad, antigüedad, QR)
//                 + balance de puntos
//                 + pasaporte verde (mapa Colombia con stamps)
//                 + cómo ganar puntos (catálogo de actividades)
//                 + push opt-in, install, cache, admin link, logout, créditos
//
// Reemplaza al perfil-view viejo "PERFIL". Las features de la sub Capo
// (foto sin marca de agua, badge dorado, multiplicador de puntos)
// arrancan en v1.0 — el schema ya está listo.

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Calendar,
  Film,
  Footprints,
  LogIn,
  LogOut,
  MapPin,
  MonitorSmartphone,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { useTribunaModes } from "@/lib/use-tribuna-mode";
import { CacheManager } from "@/components/cache-manager";
import { CreditsFooter } from "@/components/credits-footer";
import { InstallCard } from "@/components/install-card";
import { PushOptIn } from "@/components/push-opt-in";
import { useUser } from "@/components/user-provider";
import { PasaporteMapa } from "@/components/perfil/pasaporte-mapa";
import { QrCard } from "@/components/perfil/qr-card";
import { haptic } from "@/lib/haptic";

export function PerfilView() {
  const { user, loading } = useUser();

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">APP · VERSIÓN 0.4</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 44,
            lineHeight: 0.85,
          }}
        >
          PERFIL
          <br />
          SUREÑO
        </h1>
      </header>

      {loading ? (
        <HeroSkeleton />
      ) : user ? (
        <LoggedInView />
      ) : (
        <LoggedOutHero />
      )}

      <PushOptIn />
      <InstallCard />
      <CacheManager />
      <CreditsFooter variant="full" />
    </main>
  );
}

// --- Subcomponentes ---

function HeroSkeleton() {
  return (
    <section className="mx-5 my-5 rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-5">
      <div className="flex items-center gap-4">
        <div className="size-20 animate-pulse rounded-full bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-3/4 animate-pulse bg-white/5" />
          <div className="h-3 w-1/2 animate-pulse bg-white/5" />
        </div>
        <div className="size-20 animate-pulse rounded-lg bg-white/5" />
      </div>
    </section>
  );
}

function LoggedOutHero() {
  return (
    <section className="relative mx-5 my-5 overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
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
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 26,
            lineHeight: 1,
          }}
        >
          ARMÁ TU PERFIL
          <br />
          SUREÑO
        </h3>
        <p className="mt-2 max-w-sm text-[12px] font-medium uppercase leading-snug tracking-[0.03em] text-white/60">
          Carnet, pasaporte de viajes y puntos por cada partido y actividad
          de la barra. Sincronizado entre celus.
        </p>
        <Link
          href="/login?next=/perfil"
          onClick={() => haptic("tap")}
          className="btn-primary-rudo mt-4 inline-flex items-center gap-2"
        >
          <LogIn size={16} />
          ENTRAR AL PARCHE
        </Link>
      </div>
    </section>
  );
}

function LoggedInView() {
  const { user, profile } = useUser();
  const [ciudadesVisitadas, setCiudadesVisitadas] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/pasaporte", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ciudades: [] }))
      .then((d: { ciudades?: string[] }) => {
        if (!cancelled) setCiudadesVisitadas(d.ciudades ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  // Identidad para el footer del carnet (phone formateado o email).
  const identity = user.email ?? user.phone ?? "";
  const isPhone = identity.startsWith("+");
  const displayIdentity = isPhone ? formatPhone(identity) : identity;

  // Display name: apodo > nombre (legacy) > fallback derivado.
  const fallbackName = isPhone
    ? `Sureño ${identity.slice(-4)}`
    : (identity.split("@")[0] ?? "Sureño");
  const displayName = profile?.apodo || profile?.nombre || fallbackName;

  // Antigüedad calculada (años desde socio_desde hasta hoy).
  const yearNow = new Date().getFullYear();
  const antiguedad =
    profile?.socio_desde && profile.socio_desde <= yearNow
      ? yearNow - profile.socio_desde
      : null;

  // Stats del view v_perfil_sureno (vienen en profile).
  const puntos = profile?.puntos_balance ?? 0;
  const partidosAsistidos = profile?.partidos_asistidos ?? 0;
  const ciudadesCount = profile?.ciudades_visitadas ?? 0;

  return (
    <>
      {/* CARNET CARD */}
      <section className="relative mx-5 my-5 overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-1.5"
          style={{ background: "var(--color-verde-neon)" }}
        />

        {/* Header: avatar + apodo + QR */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={`Avatar de ${displayName}`}
                width={88}
                height={88}
                unoptimized
                className="size-[88px] rounded-full border-2 border-[var(--color-verde-neon)] object-cover"
              />
            ) : (
              <Image
                src="/logo.png"
                alt="Logo de Los Del Sur"
                width={88}
                height={88}
                priority
                className="size-[88px] rounded-full border-2 border-[var(--color-verde-neon)]"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="eyebrow">CARNET</div>
            <p
              className="mt-1 truncate uppercase text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 26,
                lineHeight: 1,
              }}
              title={displayName}
            >
              {displayName}
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white/40">
              {displayIdentity}
            </p>
          </div>

          <div className="flex-shrink-0">
            <QrCard userId={user.id} size={88} />
            <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-[0.1em] text-white/40">
              ESCANEÁ
            </p>
          </div>
        </div>

        {/* Datos del carnet */}
        <div className="mt-5 space-y-2">
          {profile?.combo && (
            <Row icon={<Users size={12} />} label="Combo" value={profile.combo} highlight />
          )}
          {profile?.ciudad && (
            <Row
              icon={<MapPin size={12} />}
              label={profile.barrio ? "Barrio · Ciudad" : "Ciudad"}
              value={profile.barrio ? `${profile.barrio} · ${profile.ciudad}` : profile.ciudad}
            />
          )}
          {profile?.socio_desde && (
            <Row
              icon={<Calendar size={12} />}
              label="Sureño desde"
              value={
                antiguedad !== null
                  ? `${profile.socio_desde} · ${antiguedad} ${antiguedad === 1 ? "año" : "años"}`
                  : String(profile.socio_desde)
              }
            />
          )}
          {!profile?.combo && !profile?.barrio && !profile?.socio_desde && (
            <p className="text-[11px] font-medium uppercase leading-snug tracking-[0.04em] text-white/40">
              Completá tu carnet para que sume más puntos.
            </p>
          )}
        </div>

        {/* Stats: puntos | partidos | ciudades */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <Stat icon={<Trophy size={12} />} value={puntos} label="Puntos" highlight />
          <Stat icon={<Footprints size={12} />} value={partidosAsistidos} label="Partidos" />
          <Stat icon={<MapPin size={12} />} value={ciudadesCount} label="Ciudades" />
        </div>
      </section>

      {/* PASAPORTE VERDE */}
      <section className="mx-5 my-5 rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-5">
        <div className="eyebrow flex items-center gap-1.5 text-[var(--color-verde-neon)]">
          <Footprints size={11} />
          PASAPORTE VERDE
        </div>
        <h3
          className="mt-1 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          DONDE VISTE AL VERDE
        </h3>

        <div className="mt-4">
          <PasaporteMapa ciudadesVisitadas={ciudadesVisitadas} />
        </div>
      </section>

      {/* COMO GANAR PUNTOS */}
      <section className="mx-5 my-5 rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-5">
        <div className="eyebrow">PUNTOS</div>
        <h3
          className="mt-1 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          ¿CÓMO SUMÁS?
        </h3>
        <p className="mt-2 text-[11px] font-medium uppercase leading-snug tracking-[0.04em] text-white/50">
          Mostrale tu QR a un capo de combo o admin de la barra. Te suma
          puntos por la actividad. Después se canjean en rifas.
        </p>

        <ul className="mt-4 space-y-2">
          <PuntoItem nombre="Partido en el Atanasio" puntos={10} />
          <PuntoItem nombre="Partido como visitante" puntos={25} />
          <PuntoItem nombre="Reunión de combo" puntos={5} />
          <PuntoItem nombre="Actividad de la barra" puntos={15} />
          <PuntoItem nombre="Viaje internacional" puntos={50} highlight />
        </ul>
      </section>

      {/* Acciones (sesiones, admin, logout) */}
      <PreferencesSection />

      <UserActions />
    </>
  );
}

function Row({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-1.5 font-bold uppercase tracking-[0.1em] text-white/40">
        {icon}
        {label}
      </span>
      <span
        className={`truncate font-extrabold uppercase tracking-[0.04em] ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white"
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`flex items-center gap-1 ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white/60"
        }`}
      >
        {icon}
      </div>
      <p
        className={`mt-0.5 uppercase ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white"
        }`}
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 28,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
        {label}
      </p>
    </div>
  );
}

function PuntoItem({
  nombre,
  puntos,
  highlight,
}: {
  nombre: string;
  puntos: number;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5">
      <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-white/85">
        {nombre}
      </span>
      <span
        className={`text-[12px] font-extrabold uppercase tracking-[0.06em] ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white"
        }`}
      >
        +{puntos}
      </span>
    </li>
  );
}

function PreferencesSection() {
  const [modes, setModes] = useTribunaModes();
  return (
    <section className="mx-5 my-5 rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-5">
      <div className="eyebrow flex items-center gap-1.5 text-[var(--color-verde-neon)]">
        <Film size={11} />
        PREFERENCIAS
      </div>
      <h3
        className="mt-1 uppercase text-white"
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        MODO TRIBUNA
      </h3>
      <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/65">
        Clips slow-mo de la barra: banderas, bengalas, gente saltando.
        Reemplazan el humo extintor de fondo + activan el visualizer
        audio-reactivo en el reproductor.
      </p>

      <TribunaToggle
        label="EN EL REPRODUCTOR"
        sub="Solo cuando estás escuchando una canción (inmersivo)."
        value={modes.reproductor}
        onChange={(v) => setModes({ reproductor: v })}
      />

      <TribunaToggle
        label="EN TODA LA APP"
        sub="También en home, CDs, perfil, etc. Consume más batería."
        value={modes.general}
        onChange={(v) => setModes({ general: v })}
      />
    </section>
  );
}

function TribunaToggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="mt-3 flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors hover:border-white/30"
      style={{
        background: value ? "rgba(43,255,127,0.08)" : "transparent",
        borderColor: value ? "var(--color-verde-neon)" : "rgba(255,255,255,0.15)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="text-[12px] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: value ? "var(--color-verde-neon)" : "rgba(255,255,255,0.85)" }}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[10px] font-medium uppercase leading-snug tracking-[0.04em] text-white/50">
          {sub}
        </div>
      </div>
      {/* Switch visual: track + thumb */}
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{
          background: value ? "var(--color-verde-neon)" : "rgba(255,255,255,0.15)",
        }}
      >
        <span
          className="absolute top-0.5 size-5 rounded-full bg-white transition-transform"
          style={{
            left: 2,
            transform: value ? "translateX(20px)" : "translateX(0)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />
      </span>
    </button>
  );
}

function UserActions() {
  const [isAdminFlag, setIsAdminFlag] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/is-admin")
      .then((r) => (r.ok ? r.json() : { isAdmin: false }))
      .then((d) => {
        if (!cancelled) setIsAdminFlag(Boolean(d.isAdmin));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-5 my-5 flex flex-wrap gap-2">
      <Link
        href="/perfil/sesiones"
        onClick={() => haptic("tap")}
        className="flex items-center gap-1.5 rounded-lg border-2 border-white/15 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/70 hover:border-white/30 hover:text-white"
      >
        <MonitorSmartphone size={12} />
        DISPOSITIVOS
      </Link>
      {isAdminFlag && (
        <Link
          href="/admin"
          onClick={() => haptic("tap")}
          className="flex items-center gap-1.5 rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
        >
          <Shield size={12} />
          ADMIN
        </Link>
      )}
      <form action="/auth/sign-out" method="post">
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

// Formatea +573001234567 → +57 300 123 4567 (visual nicety).
function formatPhone(e164: string): string {
  if (!e164.startsWith("+")) return e164;
  const digits = e164.slice(1);
  const last10 = digits.slice(-10);
  const cc = digits.slice(0, digits.length - 10);
  if (last10.length !== 10) return e164;
  return `+${cc} ${last10.slice(0, 3)} ${last10.slice(3, 6)} ${last10.slice(6)}`;
}
