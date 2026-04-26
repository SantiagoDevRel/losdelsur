// app/api/profile/route.ts
// PATCH — actualiza el profile del usuario autenticado.
// Usado por RegisterGate (gate inicial post-registro) y futuros editores
// de perfil. Ruta server-side para evitar el bug donde la llamada
// directa browser → supabase.co se quedaba colgando ("GUARDANDO..."
// infinito) en algunas redes/devices.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  nombre?: string | null;
  ciudad?: string | null;
  combo?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

export async function PATCH(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Sanitizar inputs — strings con .trim() y longitud máxima.
  const update: Record<string, string | null> = {};
  if (body.nombre !== undefined) {
    const v = body.nombre?.trim() ?? null;
    if (v && v.length > 40) {
      return NextResponse.json({ error: "nombre demasiado largo" }, { status: 400 });
    }
    update.nombre = v && v.length >= 2 ? v : null;
  }
  if (body.ciudad !== undefined) {
    const v = body.ciudad?.trim() ?? null;
    if (v && v.length > 50) {
      return NextResponse.json({ error: "ciudad demasiado larga" }, { status: 400 });
    }
    update.ciudad = v && v.length >= 2 ? v : null;
  }
  if (body.combo !== undefined) {
    const v = body.combo?.trim() ?? null;
    if (v && v.length > 40) {
      return NextResponse.json({ error: "combo demasiado largo" }, { status: 400 });
    }
    update.combo = v || null;
  }
  if (body.username !== undefined) {
    const v = body.username?.trim() ?? null;
    update.username = v || null;
  }
  if (body.avatar_url !== undefined) {
    update.avatar_url = body.avatar_url ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  // Upsert: si por edge case el profile no existe (trigger handle_new_user
  // falló), lo creamos. RLS permite INSERT solo cuando auth.uid() = id.
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, ...update },
      { onConflict: "id" },
    )
    .select("id, nombre, ciudad, combo, username, avatar_url")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile: data });
}
