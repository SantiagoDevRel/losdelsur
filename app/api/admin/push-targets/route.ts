// app/api/admin/push-targets/route.ts
// Estimación de cuántos devices reciben un push según el target.
// Llamado live por el composer mientras el admin elige.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "true";
  const ciudades = url.searchParams.getAll("ciudades");
  const userId = url.searchParams.get("user_id");

  const admin = createAdminClient();
  let query = admin
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });

  if (userId) {
    query = query.eq("user_id", userId);
  } else if (ciudades.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id")
      .in("ciudad", ciudades);
    const ids = (profs ?? []).map((p) => p.id as string);
    if (ids.length === 0) return NextResponse.json({ estimated: 0 });
    query = query.in("user_id", ids);
  } else if (!all) {
    return NextResponse.json({ estimated: 0 });
  }

  const { count } = await query;
  return NextResponse.json({ estimated: count ?? 0 });
}
