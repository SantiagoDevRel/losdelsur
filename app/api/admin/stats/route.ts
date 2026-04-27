// app/api/admin/stats/route.ts
// Snapshot de stats del dashboard. Polled cada 10s desde la home para
// refresco "real-time" sin requerir Supabase Realtime subscription
// (que también podríamos hacer en el futuro).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();

  // Conteos paralelos.
  const [users, subs, sessions, signups7d, signups24h, profiles, recentLogins] =
    await Promise.all([
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
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(Date.now() - 86_400_000).toISOString(),
        ),
      admin.from("profiles").select("ciudad, combo"),
      // Sesiones tocadas (last_seen_at) en últimos 5 min = "users online"
      admin
        .from("user_sessions")
        .select("user_id", { count: "exact", head: true })
        .gte(
          "last_seen_at",
          new Date(Date.now() - 5 * 60_000).toISOString(),
        ),
    ]);

  const cityCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();
  for (const row of profiles.data ?? []) {
    if (row.ciudad) cityCounts.set(row.ciudad, (cityCounts.get(row.ciudad) ?? 0) + 1);
    if (row.combo) comboCounts.set(row.combo, (comboCounts.get(row.combo) ?? 0) + 1);
  }
  const sortMap = (m: Map<string, number>, n = 5) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([label, value]) => ({ label, value }));

  return NextResponse.json({
    totalUsers: users.count ?? 0,
    activeSubs: subs.count ?? 0,
    activeSessions: sessions.count ?? 0,
    signupsLast7d: signups7d.count ?? 0,
    signupsLast24h: signups24h.count ?? 0,
    onlineNow: recentLogins.count ?? 0,
    topCities: sortMap(cityCounts),
    topCombos: sortMap(comboCounts),
    timestamp: new Date().toISOString(),
  });
}
