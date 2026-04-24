// app/api/push/subscribe/route.ts
// Guarda la Web Push subscription del browser en Supabase.
// El cliente obtiene la subscription (endpoint + keys) vía
// registration.pushManager.subscribe() y la manda acá por POST.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device_label?: string;
}

export async function POST(request: Request) {
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

  // Upsert por endpoint (unique). Si el mismo browser se re-suscribe,
  // actualizamos las keys y el user_id en vez de duplicar.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user?.id ?? null,
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
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
