// app/api/me/profile/route.ts
// GET — devuelve el profile del user autenticado.
// Usado por user-provider en vez de hablar directo con supabase.co
// desde el browser, que en algunas redes/devices se cuelga indefinidamente.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ user: null, profile: null }, { status: 200 });
  }

  // Enumeramos columnas — evitamos leakear PII si se agrega más adelante.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, username, ciudad, combo, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    user: { id: user.id, phone: user.phone ?? null, email: user.email ?? null },
    profile: data ?? null,
  });
}
