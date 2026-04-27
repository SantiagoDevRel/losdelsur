// app/admin/page.tsx
// Dashboard home — stats al vuelo. Server component, corre la query
// directamente con admin client. El layout ya validó que sea admin.

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Stats {
  totalUsers: number;
  activeSubs: number;
  activeSessions: number;
  signupsLast7d: number;
  topCities: { ciudad: string; count: number }[];
  topCombos: { combo: string; count: number }[];
}

async function loadStats(): Promise<Stats> {
  const admin = createAdminClient();

  // Conteos paralelos.
  const [users, subs, sessions, recentSignups, profiles] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true }),
    admin.from("user_sessions").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      ),
    admin.from("profiles").select("ciudad, combo"),
  ]);

  // Top cities + combos a mano (Postgres no expone group-by directo via REST).
  const cityCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();
  for (const row of profiles.data ?? []) {
    if (row.ciudad) cityCounts.set(row.ciudad, (cityCounts.get(row.ciudad) ?? 0) + 1);
    if (row.combo) comboCounts.set(row.combo, (comboCounts.get(row.combo) ?? 0) + 1);
  }
  const topCities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ciudad, count]) => ({ ciudad, count }));
  const topCombos = [...comboCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([combo, count]) => ({ combo, count }));

  return {
    totalUsers: users.count ?? 0,
    activeSubs: subs.count ?? 0,
    activeSessions: sessions.count ?? 0,
    signupsLast7d: recentSignups.count ?? 0,
    topCities,
    topCombos,
  };
}

export default async function AdminHomePage() {
  const stats = await loadStats();
  return (
    <main>
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
      <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
        Vista general del parche.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="USERS" value={stats.totalUsers} />
        <StatCard label="PUSH SUBS" value={stats.activeSubs} />
        <StatCard label="SESIONES" value={stats.activeSessions} />
        <StatCard label="NUEVOS 7D" value={stats.signupsLast7d} />
      </div>

      <Section title="TOP CIUDADES">
        {stats.topCities.length === 0 ? (
          <Empty />
        ) : (
          <BarList
            items={stats.topCities.map((c) => ({ label: c.ciudad, value: c.count }))}
            max={stats.topCities[0]!.count}
          />
        )}
      </Section>

      <Section title="TOP COMBOS">
        {stats.topCombos.length === 0 ? (
          <Empty />
        ) : (
          <BarList
            items={stats.topCombos.map((c) => ({ label: c.combo, value: c.count }))}
            max={stats.topCombos[0]!.count}
          />
        )}
      </Section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
        {label}
      </div>
      <div
        className="mt-1.5 text-white"
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

export function BarList({
  items,
  max,
}: {
  items: { label: string; value: number }[];
  max: number;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <li key={item.label} className="relative overflow-hidden rounded-lg border-2 border-white/10 bg-white/5 p-2.5">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 bg-[var(--color-verde-neon)]/15"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between gap-2">
              <span
                className="truncate text-[12px] font-extrabold uppercase tracking-[0.04em] text-white"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[12px] font-extrabold uppercase tracking-[0.05em] text-[var(--color-verde-neon)]">
                {item.value.toLocaleString("es-CO")}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
