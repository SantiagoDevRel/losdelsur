// app/api/sessions/heartbeat/route.ts
// Llamado periódicamente por el cliente (cada ~2 min vía user-provider).
// Si la sesión actual ya no aparece en user_sessions (porque otro device
// la kickeó), devuelve valid:false → cliente fuerza signOut local.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJWTSessionId } from "@/lib/sessions/utils";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ valid: false, reason: "no_session" });
  }

  const authSessionId = decodeJWTSessionId(session.access_token);
  if (!authSessionId) {
    return NextResponse.json({ valid: false, reason: "bad_jwt" });
  }

  const { data } = await supabase
    .from("user_sessions")
    .select("id")
    .eq("auth_session_id", authSessionId)
    .maybeSingle();

  if (!data) {
    // El row de mi sesión no existe → fui kickeado o nunca registré.
    return NextResponse.json({ valid: false, reason: "kicked" });
  }

  // Touch last_seen_at en background (best effort, no bloqueo la response).
  await supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return NextResponse.json({ valid: true });
}
