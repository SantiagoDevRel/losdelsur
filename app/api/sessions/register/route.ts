// app/api/sessions/register/route.ts
// Llamado por el cliente DESPUÉS de un login exitoso. Decide si crea
// una nueva sesión, si choca con el slot ocupado por otro device, o si
// el user excedió el límite mensual de cambios.
//
// Statuses:
//   200 ok                    → registrado / actualizado
//   401 unauthorized          → sin auth
//   409 conflict              → slot ocupado, fuera de cooldown → preguntar UI
//   409 cooldown              → slot ocupado, dentro de cooldown 24h → bloquear
//   429 monthly_limit         → ya hizo N switches en últimos 30 días → bloquear
//
// Body (opcional):
//   { force: true } → para forzar el reemplazo cuando el usuario confirma.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectDeviceType,
  buildDeviceLabel,
  decodeJWTSessionId,
  SESSION_POLICY,
} from "@/lib/sessions/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

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

  const authSessionId = decodeJWTSessionId(session.access_token);
  if (!authSessionId) {
    return NextResponse.json({ error: "invalid session token" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const deviceType = detectDeviceType(ua);
  const deviceLabel = buildDeviceLabel(ua);

  // 1. Hard cap mensual: ¿cuántos switches ya hizo en los últimos N días?
  const sinceISO = new Date(
    Date.now() - SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
  ).toISOString();
  const { count: switchCount } = await supabase
    .from("session_switches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("switched_at", sinceISO);

  // 2. ¿Existe ya un slot del mismo device_type para este user?
  const { data: existing } = await supabase
    .from("user_sessions")
    .select("id, auth_session_id, device_label, created_at")
    .eq("user_id", user.id)
    .eq("device_type", deviceType)
    .maybeSingle();

  // CASE A: la misma sesión ya está registrada — solo refrescar last_seen_at.
  if (existing && existing.auth_session_id === authSessionId) {
    await supabase
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, status: "already_registered" });
  }

  // CASE B: slot vacío — insert directo, sin conflicto.
  if (!existing) {
    const { error } = await supabase.from("user_sessions").insert({
      user_id: user.id,
      device_type: deviceType,
      device_label: deviceLabel,
      auth_session_id: authSessionId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "registered" });
  }

  // CASE C: conflicto — slot ocupado por otra sesión del mismo user.

  // Hard cap chequea ANTES del cooldown — si llegó al cap, ni siquiera
  // ofrecemos el "reemplazar".
  if ((switchCount ?? 0) >= SESSION_POLICY.SWITCH_LIMIT_COUNT) {
    const { data: oldestSwitch } = await supabase
      .from("session_switches")
      .select("switched_at")
      .eq("user_id", user.id)
      .gte("switched_at", sinceISO)
      .order("switched_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const unlockAt = oldestSwitch
      ? new Date(
          new Date(oldestSwitch.switched_at).getTime() +
            SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
        ).toISOString()
      : new Date(
          Date.now() + SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
        ).toISOString();
    return NextResponse.json(
      {
        error: "monthly_limit",
        switchesUsed: switchCount,
        limit: SESSION_POLICY.SWITCH_LIMIT_COUNT,
        unlockAt,
      },
      { status: 429 },
    );
  }

  // Cooldown: si la sesión existente fue creada hace < 24h, bloquear.
  const cooldownEnd = new Date(
    new Date(existing.created_at).getTime() +
      SESSION_POLICY.COOLDOWN_HOURS * 3_600_000,
  );
  if (new Date() < cooldownEnd && !force) {
    return NextResponse.json(
      {
        error: "cooldown",
        currentDevice: existing.device_label,
        currentSince: existing.created_at,
        retryAt: cooldownEnd.toISOString(),
      },
      { status: 409 },
    );
  }

  // Sin force: cooldown pasó pero hay slot ocupado → UI pregunta confirmación.
  if (!force) {
    return NextResponse.json(
      {
        error: "conflict",
        currentDevice: existing.device_label,
        currentSince: existing.created_at,
      },
      { status: 409 },
    );
  }

  // FORCE=true: el user confirmó el reemplazo.
  // 1. Audit log via service_role (integrity — el user no puede borrar su historial).
  const admin = createAdminClient();
  await admin.from("session_switches").insert({
    user_id: user.id,
    device_type: deviceType,
    old_device_label: existing.device_label,
    new_device_label: deviceLabel,
  });

  // 2. Reemplazar el row del slot con la nueva sesión.
  const { error: updErr } = await supabase
    .from("user_sessions")
    .update({
      device_label: deviceLabel,
      auth_session_id: authSessionId,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "replaced",
    oldDevice: existing.device_label,
  });
}
