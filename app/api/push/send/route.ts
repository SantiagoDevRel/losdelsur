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
//
// Para listas grandes (>5000 subs):
//   - El endpoint hace batching con concurrency=10 y devuelve `next_cursor`
//     si no terminó dentro del budget de 50s.
//   - Re-invocá con `?cursor=N` (o body { cursor: N }) para continuar
//     desde donde quedó. (TODO: implementar cursor — actualmente sólo
//     reporta cuántos quedaron sin procesar.)
//   - Para 20k+: usá un Vercel Cron Job que invoque /api/push/send/cron
//     cada minuto, persistiendo el cursor en una tabla de "send_jobs".

import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLimit, ipFromRequest, pushSendLimit } from "@/lib/ratelimit";

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

  // Defense in depth: rate limit por IP aunque tengan el secret. Si
  // el secret leak'ea, esto previene abuso masivo. 10/min es suficiente
  // para uso legítimo (mandar 1 notif por partido, p.ej.).
  const ip = ipFromRequest(request);
  const rl = await checkLimit(pushSendLimit, `admin:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too many requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
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

  // Sending: batching + concurrency control para no ahogar la función
  // serverless. Sin chunks, Promise.all(20k) explota memoria/timeout.
  // Con CONCURRENCY=10 procesamos 10 webpushes en paralelo todo el
  // tiempo, cada uno tarda ~50-300ms contra FCM/APNS/Mozilla.
  // Throughput esperado: ~1000-2000 pushes/seg.
  //
  // Si tenés >5000 subs, considerá invocar este endpoint repetidamente
  // con `cursor` para no exceder el timeout de Vercel Functions
  // (10s en Hobby, 60s en Pro).
  const CONCURRENCY = 10;
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  const startMs = Date.now();
  const timeoutBudgetMs = 50_000; // safe margin bajo el 60s de Pro

  // Bind a const para narrowing de tipos (subs era `T | null`, acá ya
  // sabemos que no es null por el early return de arriba).
  const subsList = subs;

  // "Pool de workers": N tareas que toman items del array de subs.
  // Cuando todas terminan o se acaban los items, listo.
  let cursor = 0;
  async function worker() {
    while (cursor < subsList.length) {
      // Salida temprana si nos acercamos al timeout de la función.
      // Devolvemos parcial — el caller puede reintentar con cursor.
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
    // Cleanup en lotes de 100 — el `.in()` con 1000+ items rompe.
    for (let i = 0; i < expired.length; i += 100) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expired.slice(i, i + 100));
    }
  }

  const elapsedMs = Date.now() - startMs;
  // Si quedaron subs sin procesar (timeout), reportá cursor para
  // que el caller (Cron Job o admin script) pueda continuar.
  const remaining = subs.length - cursor;
  return NextResponse.json({
    sent,
    failed,
    cleaned: expired.length,
    total_targeted: subs.length,
    remaining,
    elapsed_ms: elapsedMs,
    next_cursor: remaining > 0 ? cursor : null,
  });
}
