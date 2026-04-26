// app/api/push/subscribe/route.ts
// Guarda la Web Push subscription del browser en Supabase.
// Requiere usuario autenticado: las subs anónimas se eliminaron por
// seguridad (cualquiera podía leer/borrar endpoints+keys ajenos).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLimit, ipFromRequest, pushSubscribeLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

interface Body {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device_label?: string;
}

export async function POST(request: Request) {
  // Rate limit por IP — un device legítimo se suscribe una vez. Más de
  // 5 en un minuto = bot.
  const ip = ipFromRequest(request);
  const rl = await checkLimit(pushSubscribeLimit, `ip:${ip}`);
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

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Upsert por endpoint (unique). Si el mismo browser se re-suscribe,
  // actualizamos las keys y el user_id en vez de duplicar.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth_token: body.keys.auth,
        device_label: body.device_label ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "missing endpoint" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS ya filtra por user_id, pero filtramos explícito (defense in depth).
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
