// app/api/admin/push-send/route.ts
// Wrapper de /api/push/send pero con auth via cookie + is_admin (en vez
// del header x-admin-secret). Permite que el admin dashboard envíe sin
// exponer el admin secret en cliente.
//
// La lógica de envío real está duplicada acá adrede para no abrir un
// loophole en /api/push/send (que sigue requiriendo el secret).

import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

interface Body {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  user_ids?: string[];
  ciudades?: string[];
  all?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, pub, priv);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.title || !body.body) {
    return NextResponse.json({ error: "missing title or body" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin.from("push_subscriptions").select("endpoint, p256dh, auth_token, user_id");

  if (body.user_ids && body.user_ids.length > 0) {
    query = query.in("user_id", body.user_ids);
  } else if (body.ciudades && body.ciudades.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id")
      .in("ciudad", body.ciudades);
    const ids = (profs ?? []).map((p) => p.id as string);
    if (ids.length === 0) {
      return NextResponse.json({
        sent: 0, failed: 0, cleaned: 0, total_targeted: 0, remaining: 0,
      });
    }
    query = query.in("user_id", ids);
  } else if (!body.all) {
    return NextResponse.json({ error: "pass user_ids, ciudades, or all:true" }, { status: 400 });
  }

  const { data: subs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) {
    return NextResponse.json({
      sent: 0, failed: 0, cleaned: 0, total_targeted: 0, remaining: 0,
    });
  }

  const payload = JSON.stringify({
    title: body.title,
    body: body.body,
    url: body.url ?? "/",
    icon: body.icon ?? "/icons/icon-192.png",
  });

  const CONCURRENCY = 10;
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  const startMs = Date.now();
  const timeoutBudgetMs = 50_000;
  const subsList = subs;
  let cursor = 0;

  async function worker() {
    while (cursor < subsList.length) {
      if (Date.now() - startMs > timeoutBudgetMs) return;
      const idx = cursor++;
      const s = subsList[idx];
      if (!s) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth_token as string },
          },
          payload,
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const e = err as { statusCode?: number };
        if (e.statusCode === 404 || e.statusCode === 410) {
          expired.push(s.endpoint as string);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (expired.length > 0) {
    for (let i = 0; i < expired.length; i += 100) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expired.slice(i, i + 100));
    }
  }

  // Audit log — record this send for /admin/push history.
  // Determine target_type/value from body for the record.
  const targetType: "all" | "ciudades" | "user" =
    body.user_ids && body.user_ids.length > 0
      ? "user"
      : body.ciudades && body.ciudades.length > 0
        ? "ciudades"
        : "all";
  const targetValue =
    targetType === "user"
      ? body.user_ids
      : targetType === "ciudades"
        ? body.ciudades
        : null;
  await admin.from("push_history").insert({
    sent_by: user.id,
    title: body.title,
    body: body.body,
    url: body.url ?? null,
    target_type: targetType,
    target_value: targetValue,
    total_targeted: subs.length,
    sent_count: sent,
    failed_count: failed,
    cleaned_count: expired.length,
    duration_ms: Date.now() - startMs,
  });

  return NextResponse.json({
    sent,
    failed,
    cleaned: expired.length,
    total_targeted: subs.length,
    remaining: subs.length - cursor,
  });
}
