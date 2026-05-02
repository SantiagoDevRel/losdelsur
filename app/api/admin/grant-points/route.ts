// app/api/admin/grant-points/route.ts
// POST — admin asigna puntos a un user por una actividad. Si la
// actividad es de partido (partido_local | partido_visita), también
// inserta un row en partido_asistencia para stampearle el pasaporte.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

interface Body {
  user_id: string;            // target user
  actividad_slug: string;     // 'partido_local' | 'partido_visita' | etc
  partido_id?: string | null; // requerido si actividad es de partido
  puntos?: number | null;     // opcional, override del default
  motivo?: string | null;     // texto libre
}

const PARTIDO_SLUGS = new Set(["partido_local", "partido_visita"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.user_id || !body.actividad_slug) {
    return NextResponse.json({ error: "user_id + actividad_slug required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver actividad.
  const { data: actividad, error: aErr } = await admin
    .from("actividades")
    .select("id, slug, nombre, puntos_default")
    .eq("slug", body.actividad_slug)
    .eq("activa", true)
    .maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!actividad) return NextResponse.json({ error: "actividad not found" }, { status: 404 });

  const isPartidoActivity = PARTIDO_SLUGS.has(actividad.slug);
  if (isPartidoActivity && !body.partido_id) {
    return NextResponse.json(
      { error: "partido_id required for partido activity" },
      { status: 400 },
    );
  }

  // Validar partido si aplica.
  let partidoCiudad: string | null = null;
  if (body.partido_id) {
    const { data: partido } = await admin
      .from("partidos")
      .select("id, ciudad")
      .eq("id", body.partido_id)
      .maybeSingle();
    if (!partido) return NextResponse.json({ error: "partido not found" }, { status: 404 });
    partidoCiudad = partido.ciudad;
  }

  // Validar target user existe.
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, apodo, nombre, ciudad")
    .eq("id", body.user_id)
    .maybeSingle();
  if (!targetProfile) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const puntos = body.puntos ?? actividad.puntos_default;
  if (typeof puntos !== "number" || !Number.isFinite(puntos) || puntos === 0) {
    return NextResponse.json({ error: "puntos invalid" }, { status: 400 });
  }

  // Insert puntos_movimientos.
  const { error: pErr } = await admin
    .from("puntos_movimientos")
    .insert({
      user_id: body.user_id,
      actividad_id: actividad.id,
      partido_id: body.partido_id ?? null,
      puntos,
      motivo: body.motivo ?? actividad.nombre,
      otorgado_por: user.id,
    });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Si es actividad de partido, intentamos stampear el pasaporte.
  // Si ya existe (mismo user × mismo partido), on_conflict do nothing.
  if (isPartidoActivity && body.partido_id && partidoCiudad) {
    await admin
      .from("partido_asistencia")
      .upsert(
        {
          user_id: body.user_id,
          partido_id: body.partido_id,
          ciudad: partidoCiudad,
          checkeado_por: user.id,
        },
        { onConflict: "user_id,partido_id", ignoreDuplicates: true },
      );
  }

  // Devolver balance actualizado del user para feedback inmediato en UI.
  const { data: balanceRow } = await admin
    .from("v_perfil_sureno")
    .select("apodo, nombre, ciudad, puntos_balance, partidos_asistidos, ciudades_visitadas")
    .eq("id", body.user_id)
    .single();

  return NextResponse.json({
    ok: true,
    actividad: { slug: actividad.slug, nombre: actividad.nombre },
    puntos_otorgados: puntos,
    target: balanceRow,
  });
}
