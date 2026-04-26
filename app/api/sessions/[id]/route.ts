// app/api/sessions/[id]/route.ts
// DELETE — el user cierra una de sus sesiones activas (típicamente la
// "del otro device" desde la página /perfil/sesiones).
// Cuando borra el row, el otro device — en su próximo heartbeat — recibe
// valid:false y hace signOut local.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS ya filtra por user_id, pero defense in depth.
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
