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
//
// Same-device detection: usamos un device_id persistente (cookie 5 años)
// para distinguir "este es mi mismo device, solo refresco la sesión"
// vs "otro device físico está intentando tomar el slot". Sin esto,
// re-loguearse desde el mismo device tras logout/clear-cookies dispara
// el cooldown anti-rotation, lo cual es un bug.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectDeviceType,
  buildDeviceLabel,
  decodeJWTSessionId,
  generateDeviceId,
  isSessionLimitBypass,
  DEVICE_ID_COOKIE,
  DEVICE_ID_COOKIE_MAX_AGE_S,
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

  // Device ID: persistente por cookie httpOnly. Si no existe, lo creamos
  // y lo seteamos en la response (próximo request ya lo trae).
  const cookieStore = await cookies();
  let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  let setNewCookie = false;
  if (!deviceId) {
    deviceId = generateDeviceId();
    setNewCookie = true;
  }

  const ua = request.headers.get("user-agent") ?? "";
  const deviceType = detectDeviceType(ua);
  const deviceLabel = buildDeviceLabel(ua);

  // BYPASS: si el phone está en SESSION_BYPASS_PHONES, salteamos toda la
  // lógica de slot/cooldown/cap y simplemente refrescamos o insertamos
  // un row por sesión Supabase. Esto permite múltiples devices simultáneos
  // sin restricciones (founder demo / soporte / debugging en producción).
  if (isSessionLimitBypass(user.phone)) {
    const { data: existingByAuth } = await supabase
      .from("user_sessions")
      .select("id, device_id")
      .eq("user_id", user.id)
      .eq("auth_session_id", authSessionId)
      .maybeSingle();

    if (existingByAuth) {
      await supabase
        .from("user_sessions")
        .update({
          last_seen_at: new Date().toISOString(),
          device_label: deviceLabel,
          device_id: existingByAuth.device_id ?? deviceId,
        })
        .eq("id", existingByAuth.id);
      return withDeviceCookie({ ok: true, status: "bypass_refreshed" });
    }

    const { error } = await supabase.from("user_sessions").insert({
      user_id: user.id,
      device_type: deviceType,
      device_label: deviceLabel,
      device_id: deviceId,
      auth_session_id: authSessionId,
    });
    if (error) {
      return withDeviceCookie({ error: error.message }, 500);
    }
    return withDeviceCookie({ ok: true, status: "bypass_registered" });
  }

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
    .select("id, auth_session_id, device_id, device_label, created_at")
    .eq("user_id", user.id)
    .eq("device_type", deviceType)
    .maybeSingle();

  // Helper para crear la response y attachar el device_id cookie si era
  // primera vez. Cookie httpOnly + secure + 5 años + samesite lax.
  function withDeviceCookie(body: unknown, status = 200) {
    const res = NextResponse.json(body, { status });
    if (setNewCookie && deviceId) {
      res.cookies.set({
        name: DEVICE_ID_COOKIE,
        value: deviceId,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: DEVICE_ID_COOKIE_MAX_AGE_S,
        path: "/",
      });
    }
    return res;
  }

  // CASE A1: la misma sesión Supabase ya está registrada — refresh.
  if (existing && existing.auth_session_id === authSessionId) {
    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        device_id: existing.device_id ?? deviceId,
      })
      .eq("id", existing.id);
    return withDeviceCookie({ ok: true, status: "already_registered" });
  }

  // CASE A2: MISMO device físico (device_id matchea) pero sesión Supabase
  // distinta (porque hizo logout/clear-cookies y volvió a OTPear).
  // Tratamos como refresh, NO como switch — sin cooldown, sin audit log.
  // Esto fixea el bug "no me deja entrar de mi propia laptop después de
  // re-loguear".
  if (
    existing &&
    existing.device_id &&
    existing.device_id === deviceId
  ) {
    await supabase
      .from("user_sessions")
      .update({
        auth_session_id: authSessionId,
        device_label: deviceLabel,
        last_seen_at: new Date().toISOString(),
        // NO actualizamos created_at — preservamos la antigüedad real
        // del device para mantener el cooldown vs OTROS devices.
      })
      .eq("id", existing.id);
    return withDeviceCookie({ ok: true, status: "refreshed_same_device" });
  }

  // CASE B: slot vacío — insert directo, sin conflicto.
  if (!existing) {
    const { error } = await supabase.from("user_sessions").insert({
      user_id: user.id,
      device_type: deviceType,
      device_label: deviceLabel,
      device_id: deviceId,
      auth_session_id: authSessionId,
    });
    if (error) {
      return withDeviceCookie({ error: error.message }, 500);
    }
    return withDeviceCookie({ ok: true, status: "registered" });
  }

  // CASE C: conflicto — slot ocupado por OTRO device físico (device_id distinto).

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
    return withDeviceCookie(
      {
        error: "monthly_limit",
        switchesUsed: switchCount,
        limit: SESSION_POLICY.SWITCH_LIMIT_COUNT,
        unlockAt,
      },
      429,
    );
  }

  // Cooldown: si la sesión existente fue creada hace < 24h, bloquear.
  const cooldownEnd = new Date(
    new Date(existing.created_at).getTime() +
      SESSION_POLICY.COOLDOWN_HOURS * 3_600_000,
  );
  if (new Date() < cooldownEnd && !force) {
    return withDeviceCookie(
      {
        error: "cooldown",
        currentDevice: existing.device_label,
        currentSince: existing.created_at,
        retryAt: cooldownEnd.toISOString(),
      },
      409,
    );
  }

  // Sin force: cooldown pasó pero hay slot ocupado → UI pregunta confirmación.
  if (!force) {
    return withDeviceCookie(
      {
        error: "conflict",
        currentDevice: existing.device_label,
        currentSince: existing.created_at,
      },
      409,
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
      device_id: deviceId,
      auth_session_id: authSessionId,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updErr) {
    return withDeviceCookie({ error: updErr.message }, 500);
  }

  return withDeviceCookie({
    ok: true,
    status: "replaced",
    oldDevice: existing.device_label,
  });
}
