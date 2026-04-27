// app/admin/dashboard-view.tsx
// Dashboard con polling cada 10s para sensación real-time, incluye:
//  - Stat cards básicas (users, subs, sessions, online ahora)
//  - Twilio costs (si las env vars están configuradas)
//  - Top ciudades + combos

"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Wifi } from "lucide-react";
import { BarList } from "@/components/admin/bar-list";

export interface Stats {
  totalUsers: number;
  activeSubs: number;
  activeSessions: number;
  signupsLast7d: number;
  signupsLast24h: number;
  onlineNow: number;
  topCities: { label: string; value: number }[];
  topCombos: { label: string; value: number }[];
  timestamp: string;
}

interface TwilioUsage {
  configured: boolean;
  message?: string;
  currency?: string;
  this_month?: { sms_count: number; cost: number };
  all_time?: { sms_count: number; cost: number };
  error?: string;
}

const POLL_INTERVAL_MS = 10_000;

export function DashboardView({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState<Stats>(initial);
  const [twilio, setTwilio] = useState<TwilioUsage | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Polling de stats.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      setRefreshing(true);
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Twilio fetch one-time on mount + cada 5 min después.
  useEffect(() => {
    let cancelled = false;
    async function loadTwilio() {
      try {
        const res = await fetch("/api/admin/twilio-usage", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as TwilioUsage;
        if (!cancelled) setTwilio(data);
      } catch {
        /* noop */
      }
    }
    void loadTwilio();
    const id = setInterval(loadTwilio, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const lastUpdate = relativeTime(stats.timestamp);

  return (
    <main>
      <div className="flex items-baseline justify-between gap-3">
        <h1
          className="uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 44,
            lineHeight: 0.9,
          }}
        >
          DASHBOARD
        </h1>
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white/40">
          <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
          {lastUpdate}
        </span>
      </div>
      <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
        Vista del parche en vivo · refresca cada 10s.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="ONLINE AHORA"
          value={stats.onlineNow}
          icon={<Wifi size={12} className="text-[var(--color-verde-neon)]" />}
        />
        <StatCard label="USERS TOTAL" value={stats.totalUsers} />
        <StatCard label="PUSH SUBS" value={stats.activeSubs} />
        <StatCard label="SESIONES" value={stats.activeSessions} />
        <StatCard label="NUEVOS 24H" value={stats.signupsLast24h} highlight />
        <StatCard label="NUEVOS 7D" value={stats.signupsLast7d} />
      </div>

      <Section title="💰 TWILIO COSTOS">
        <TwilioCard data={twilio} />
      </Section>

      <Section title="📍 TOP CIUDADES">
        {stats.topCities.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={stats.topCities} max={stats.topCities[0]!.value} />
        )}
      </Section>

      <Section title="👥 TOP COMBOS">
        {stats.topCombos.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={stats.topCombos} max={stats.topCombos[0]!.value} />
        )}
      </Section>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 ${highlight ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10" : "border-white/10 bg-white/5"}`}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1.5 ${highlight ? "text-[var(--color-verde-neon)]" : "text-white"}`}
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 32,
          lineHeight: 1,
        }}
      >
        {value.toLocaleString("es-CO")}
      </div>
    </div>
  );
}

function TwilioCard({ data }: { data: TwilioUsage | null }) {
  if (!data) {
    return (
      <div className="grid place-items-center rounded-2xl border-2 border-white/10 bg-white/5 p-6">
        <Loader2 className="animate-spin text-white/40" size={20} />
      </div>
    );
  }
  if (!data.configured) {
    return (
      <div className="rounded-2xl border-2 border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-[11px] font-medium uppercase leading-snug tracking-[0.04em] text-yellow-200">
          ⚠️ Twilio no configurado
        </p>
        <p className="mt-2 text-[11px] font-medium uppercase leading-snug tracking-[0.03em] text-white/60">
          {data.message ??
            "Agregá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en Vercel env vars para ver costos reales."}
        </p>
        <ul className="mt-3 list-inside list-disc space-y-0.5 text-[10px] uppercase tracking-[0.03em] text-white/50">
          <li>Twilio Console → Account Info → Account SID + Auth Token</li>
          <li>Vercel Settings → Env Vars → Add (production + preview)</li>
          <li>Redeploy</li>
        </ul>
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-red-300">
          Error fetching Twilio: {data.error}
        </p>
      </div>
    );
  }

  const fmt = (n: number) => {
    if (data.currency === "USD") return `$${n.toFixed(2)} USD`;
    return `${n.toFixed(2)} ${data.currency}`;
  };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
          <MessageCircle size={11} />
          ESTE MES
        </div>
        <div
          className="mt-1.5 text-[var(--color-verde-neon)]"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          {fmt(data.this_month?.cost ?? 0)}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.05em] text-white/40">
          {(data.this_month?.sms_count ?? 0).toLocaleString("es-CO")} SMS enviados
        </div>
      </div>
      <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
          <MessageCircle size={11} />
          TOTAL HISTÓRICO
        </div>
        <div
          className="mt-1.5 text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          {fmt(data.all_time?.cost ?? 0)}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.05em] text-white/40">
          {(data.all_time?.sms_count ?? 0).toLocaleString("es-CO")} SMS totales
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-white/40">
      Sin datos todavía.
    </p>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 5) return "ahora";
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  return `hace ${min}m`;
}
