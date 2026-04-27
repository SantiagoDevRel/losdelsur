// app/api/admin/push-history/route.ts
// GET — historial de pushes enviados (audit log).

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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_history")
    .select(
      "id, title, body, url, target_type, target_value, total_targeted, sent_count, failed_count, cleaned_count, duration_ms, sent_at",
    )
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
