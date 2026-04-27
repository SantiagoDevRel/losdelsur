// app/admin/analytics/page.tsx
// Stats de canciones (más escuchadas / descargadas / favoritas) y de
// users (top ciudades, combos, registros recientes). Todo server-side
// con admin client — lo más simple posible.

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCanciones } from "@/lib/content";
import { BarList } from "@/components/admin/bar-list";

export const dynamic = "force-dynamic";

interface Aggregates {
  topPlayed: { label: string; value: number }[];
  topDownloaded: { label: string; value: number }[];
  topFavorited: { label: string; value: number }[];
  topCities: { label: string; value: number }[];
  topCombos: { label: string; value: number }[];
}

async function loadAnalytics(): Promise<Aggregates> {
  const admin = createAdminClient();
  const [plays, downloads, favorites, profiles] = await Promise.all([
    admin.from("user_plays").select("cancion_id, play_count"),
    admin.from("user_downloads").select("cancion_id"),
    admin.from("user_favorites").select("cancion_id"),
    admin.from("profiles").select("ciudad, combo"),
  ]);

  // Map cancion_id → title via content (build-time data).
  const titleById = new Map<string, string>();
  for (const c of getAllCanciones()) {
    titleById.set(c.id, c.titulo);
    // Algunos plays guardan el slug en vez del id — index ambos.
    titleById.set(c.slug, c.titulo);
  }

  const topByCount = (
    rows: { cancion_id: string; play_count?: number }[] | null,
    field?: "play_count",
  ) => {
    if (!rows) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = r.cancion_id;
      const inc = field && r[field] !== undefined ? (r[field] as number) : 1;
      counts.set(key, (counts.get(key) ?? 0) + inc);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, n]) => ({ label: titleById.get(id) ?? id, value: n }));
  };

  const cityCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();
  for (const p of profiles.data ?? []) {
    if (p.ciudad) cityCounts.set(p.ciudad, (cityCounts.get(p.ciudad) ?? 0) + 1);
    if (p.combo) comboCounts.set(p.combo, (comboCounts.get(p.combo) ?? 0) + 1);
  }

  const sortMap = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ label: k, value: v }));

  return {
    topPlayed: topByCount(plays.data, "play_count"),
    topDownloaded: topByCount(downloads.data),
    topFavorited: topByCount(favorites.data),
    topCities: sortMap(cityCounts),
    topCombos: sortMap(comboCounts),
  };
}

export default async function AdminAnalyticsPage() {
  const a = await loadAnalytics();
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
        ANALYTICS
      </h1>
      <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
        Qué se está escuchando en el parche.
      </p>

      <Section title="🎵 MÁS ESCUCHADAS">
        {a.topPlayed.length === 0 ? <Empty /> : <BarList items={a.topPlayed} max={a.topPlayed[0]!.value} />}
      </Section>

      <Section title="⬇️ MÁS DESCARGADAS">
        {a.topDownloaded.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={a.topDownloaded} max={a.topDownloaded[0]!.value} />
        )}
      </Section>

      <Section title="❤️ FAVORITAS">
        {a.topFavorited.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={a.topFavorited} max={a.topFavorited[0]!.value} />
        )}
      </Section>

      <Section title="📍 CIUDADES">
        {a.topCities.length === 0 ? <Empty /> : <BarList items={a.topCities} max={a.topCities[0]!.value} />}
      </Section>

      <Section title="👥 COMBOS">
        {a.topCombos.length === 0 ? <Empty /> : <BarList items={a.topCombos} max={a.topCombos[0]!.value} />}
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
