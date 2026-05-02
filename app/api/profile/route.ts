// app/api/profile/route.ts
// PATCH — actualiza el profile del usuario autenticado.
// Usado por RegisterGate (gate inicial post-registro) y futuros editores
// de perfil. Ruta server-side para evitar el bug donde la llamada
// directa browser → supabase.co se quedaba colgando ("GUARDANDO..."
// infinito) en algunas redes/devices.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLimit, profileUpdateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

interface Body {
  // `nombre` queda por compat con el RegisterGate viejo. El nuevo gate
  // manda `apodo`. Si llega `nombre` solo, lo guardamos también en apodo
  // (más coloquial, es lo que mostramos en el carnet).
  nombre?: string | null;
  apodo?: string | null;
  ciudad?: string | null;
  barrio?: string | null;
  combo?: string | null;
  socio_desde?: number | null;
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

  // Rate limit por user — 10 PATCHes/min. Edits legítimos son raros,
  // este cap evita scripts de spam de profile.
  const rl = await checkLimit(profileUpdateLimit, `user:${user.id}`);
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

  // Sanitizar inputs — strings con .trim() y longitud máxima.
  const update: Record<string, string | number | null> = {};
  if (body.apodo !== undefined) {
    const v = body.apodo?.trim() ?? null;
    if (v && v.length > 40) {
      return NextResponse.json({ error: "apodo demasiado largo" }, { status: 400 });
    }
    update.apodo = v && v.length >= 2 ? v : null;
  }
  if (body.nombre !== undefined) {
    const v = body.nombre?.trim() ?? null;
    if (v && v.length > 40) {
      return NextResponse.json({ error: "nombre demasiado largo" }, { status: 400 });
    }
    update.nombre = v && v.length >= 2 ? v : null;
    // Compat: si viene nombre y no apodo, espejamos a apodo (que es lo
    // que muestra el carnet). El gate nuevo ya manda apodo directo.
    if (body.apodo === undefined && update.nombre) {
      update.apodo = update.nombre;
    }
  }
  if (body.ciudad !== undefined) {
    const v = body.ciudad?.trim() ?? null;
    if (v && v.length > 50) {
      return NextResponse.json({ error: "ciudad demasiado larga" }, { status: 400 });
    }
    update.ciudad = v && v.length >= 2 ? v : null;
  }
  if (body.barrio !== undefined) {
    const v = body.barrio?.trim() ?? null;
    if (v && v.length > 60) {
      return NextResponse.json({ error: "barrio demasiado largo" }, { status: 400 });
    }
    update.barrio = v || null;
  }
  if (body.combo !== undefined) {
    const v = body.combo?.trim() ?? null;
    if (v && v.length > 40) {
      return NextResponse.json({ error: "combo demasiado largo" }, { status: 400 });
    }
    update.combo = v || null;
  }
  if (body.socio_desde !== undefined) {
    const v = body.socio_desde;
    if (v !== null && (typeof v !== "number" || v < 1990 || v > 2100)) {
      return NextResponse.json({ error: "socio_desde fuera de rango" }, { status: 400 });
    }
    update.socio_desde = v ?? null;
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

  // Upsert sobre la tabla base (RLS permite si auth.uid() = id). Después
  // re-leemos de la view para devolver el shape completo (con balance y
  // stats) — UI ya espera PerfilSureno.
  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...update }, { onConflict: "id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("v_perfil_sureno")
    .select(
      "id, apodo, nombre, username, ciudad, barrio, combo, socio_desde, avatar_url, subscription_tier, subscription_until, puntos_balance, partidos_asistidos, ciudades_visitadas",
    )
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile: data });
}
