// app/api/sessions/route.ts
// GET — lista las sesiones activas del usuario actual (1-2 rows max).
// Usado por la página /perfil/sesiones.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJWTSessionId } from "@/lib/sessions/utils";

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const currentSessionId = decodeJWTSessionId(session.access_token);

  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, device_type, device_label, created_at, last_seen_at, auth_session_id")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Marcamos cuál es la sesión actual (la del browser que llamó este GET)
  // para que la UI le ponga "este device" y no permita auto-kickearse.
  const sessions = (data ?? []).map((s) => ({
    id: s.id,
    device_type: s.device_type,
    device_label: s.device_label,
    created_at: s.created_at,
    last_seen_at: s.last_seen_at,
    is_current: s.auth_session_id === currentSessionId,
  }));

  return NextResponse.json({ sessions });
}
