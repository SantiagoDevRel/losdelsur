// app/api/sessions/heartbeat/route.ts
// Llamado periódicamente por el cliente (cada ~2 min vía user-provider).
// Si la sesión actual ya no aparece en user_sessions (porque otro device
// la kickeó), devuelve valid:false → cliente fuerza signOut local.
//
// "Kicked" se decide así:
//   1. Mi session_id está en user_sessions → valid (refresh y vuelvo)
//   2. Mi session_id NO está, PERO el user no tiene NINGUNA sesión
//      registrada → estoy en pre-register (post-login antes de que
//      /api/sessions/register termine, race condition) → valid GRACE
//   3. Mi session_id NO está, PERO el user tiene OTRAS sesiones
//      registradas → otra sesión me reemplazó → valid:false reason kicked
//
// Sin la regla 2, el heartbeat post-login dispara antes que el register
// y te saca con "kicked" en tu propio login fresco.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJWTSessionId, isSessionLimitBypass } from "@/lib/sessions/utils";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session) {
    return NextResponse.json({ valid: false, reason: "no_session" });
  }

  const authSessionId = decodeJWTSessionId(session.access_token);
  if (!authSessionId) {
    return NextResponse.json({ valid: false, reason: "bad_jwt" });
  }

  // BYPASS founder: nunca kickeable. Aunque el row no exista todavía
  // (race con register), igual valid:true. Para el bypass user el
  // session-limit literalmente no aplica.
  if (isSessionLimitBypass(user.phone)) {
    // Touch last_seen_at si encontramos el row — best effort.
    await supabase
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("auth_session_id", authSessionId);
    return NextResponse.json({ valid: true, reason: "bypass" });
  }

  // Caso 1: mi sesión está registrada → todo OK.
  const { data: mySession } = await supabase
    .from("user_sessions")
    .select("id")
    .eq("auth_session_id", authSessionId)
    .maybeSingle();

  if (mySession) {
    // Touch last_seen_at.
    await supabase
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", mySession.id);
    return NextResponse.json({ valid: true });
  }

  // Caso 2/3: mi sesión NO está. ¿El user tiene sesiones registradas?
  const { count } = await supabase
    .from("user_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) === 0) {
    // Pre-register: el user todavía no tiene sesiones — probablemente
    // el cliente acaba de loguearse y /api/sessions/register no terminó.
    // Damos grace para evitar self-kick race condition.
    return NextResponse.json({ valid: true, reason: "pre_register" });
  }

  // El user tiene otras sesiones pero la mía no figura → fui reemplazado.
  return NextResponse.json({ valid: false, reason: "kicked" });
}
