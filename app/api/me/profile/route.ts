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

  // Lee de la view v_perfil_sureno → trae profile + balance de puntos +
  // stats de pasaporte en una sola query. RLS heredado de las tablas.
  const { data, error } = await supabase
    .from("v_perfil_sureno")
    .select(
      "id, apodo, nombre, username, ciudad, barrio, combo, socio_desde, avatar_url, subscription_tier, subscription_until, puntos_balance, partidos_asistidos, ciudades_visitadas",
    )
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
