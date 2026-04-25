// app/api/push/send/route.ts
// Endpoint admin para disparar notifs push.
// Auth: requiere el secret ADMIN_PUSH_SECRET en el header "x-admin-secret".
// Si el secret no está seteado en env, el endpoint queda deshabilitado.
//
// Uso típico (para probar):
//   curl -X POST https://losdelsur.vercel.app/api/push/send \
//     -H "Content-Type: application/json" \
//     -H "x-admin-secret: TU_SECRET" \
//     -d '{"title":"Hay partido mañana!","body":"Descargá los cánticos antes de ir al Atanasio.","url":"/library"}'
//
// Filtros opcionales:
//   - user_ids: array de UUIDs — solo manda a esos users.
//   - ciudades: array ["Medellín", "Bogotá"] — solo a esas ciudades.
//   - all: true — a todas las subscriptions.

import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const adminSecret = process.env.ADMIN_PUSH_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "admin endpoint not configured" }, { status: 503 });
  }
  if (request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  // Admin client (service_role) — bypassa RLS para poder targetear
  // a cualquier user. Seguro porque ya validamos el admin secret.
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "admin client init failed" },
      { status: 500 },
    );
  }

  let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth_token, user_id");

  if (body.user_ids && body.user_ids.length > 0) {
    query = query.in("user_id", body.user_ids);
  } else if (body.ciudades && body.ciudades.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id")
      .in("ciudad", body.ciudades);
    const ids = (profs ?? []).map((p) => p.id as string);
    if (ids.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 });
    }
    query = query.in("user_id", ids);
  } else if (!body.all) {
    return NextResponse.json({ error: "pass user_ids, ciudades, or all:true" }, { status: 400 });
  }

  const { data: subs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0, failed: 0 });

  const payload = JSON.stringify({
    title: body.title,
    body: body.body,
    url: body.url ?? "/",
    icon: body.icon ?? "/icons/icon-192.png",
  });

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
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
          // Subscription expiró — la vamos a borrar después.
          expired.push(s.endpoint as string);
        }
      }
    }),
  );

  if (expired.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expired);
  }

  return NextResponse.json({ sent, failed, cleaned: expired.length });
}
