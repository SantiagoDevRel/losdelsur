// app/auth/callback/route.ts
// Handler de callback para OAuth providers (Google) y magic links.
// Supabase redirige acá con un `code` que intercambiamos por sesión.
// Después del intercambio exitoso registramos la sesión en user_sessions
// para enforzar la regla "1 mobile + 1 desktop". Si hay conflicto,
// redirigimos a /login?conflict=<kind>&... para que el cliente muestre modal.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDeviceLabel,
  decodeJWTSessionId,
  DEVICE_ID_COOKIE,
  DEVICE_ID_COOKIE_MAX_AGE_S,
  detectDeviceType,
  generateDeviceId,
  SESSION_POLICY,
} from "@/lib/sessions/utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/perfil";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  // --- Registrar sesión inline (mismo cookie store del exchange) ---
  // Replicamos la lógica de /api/sessions/register sin re-fetch HTTP.
  // En conflict/cooldown/cap redirigimos a /login con params para modal.

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  const authSessionId = decodeJWTSessionId(session.access_token);
  if (!authSessionId) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const ua = request.headers.get("user-agent") ?? "";
  const deviceType = detectDeviceType(ua);
  const deviceLabel = buildDeviceLabel(ua);

  // Device ID persistente (cookie 5 años) — distingue mismo device físico
  // re-OTPeando vs otro device intentando tomar el slot.
  const cookieStore = await cookies();
  let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  let setNewCookie = false;
  if (!deviceId) {
    deviceId = generateDeviceId();
    setNewCookie = true;
  }

  // Helper redirect que setea el device cookie si era primera vez.
  function redirectWithCookie(target: URL) {
    const res = NextResponse.redirect(target);
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

  // Existing slot?
  const { data: existing } = await supabase
    .from("user_sessions")
    .select("id, auth_session_id, device_id, device_label, created_at")
    .eq("user_id", user.id)
    .eq("device_type", deviceType)
    .maybeSingle();

  // Mismo session_id → solo refresh.
  if (existing && existing.auth_session_id === authSessionId) {
    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        device_id: existing.device_id ?? deviceId,
      })
      .eq("id", existing.id);
    return redirectWithCookie(new URL(next, url.origin));
  }

  // MISMO device físico (device_id matchea) — refresh, no switch.
  if (existing && existing.device_id && existing.device_id === deviceId) {
    await supabase
      .from("user_sessions")
      .update({
        auth_session_id: authSessionId,
        device_label: deviceLabel,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return redirectWithCookie(new URL(next, url.origin));
  }

  // Slot vacío → insert.
  if (!existing) {
    await supabase.from("user_sessions").insert({
      user_id: user.id,
      device_type: deviceType,
      device_label: deviceLabel,
      device_id: deviceId,
      auth_session_id: authSessionId,
    });
    return redirectWithCookie(new URL(next, url.origin));
  }

  // Hay conflicto. Magic link no permite confirmación inline (es flow
  // server-side). Cerramos sesión local y redirigimos a /login con
  // params explicativos. El cliente decide qué modal mostrar.

  // Hard cap?
  const sinceISO = new Date(
    Date.now() - SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
  ).toISOString();
  const { count: switchCount } = await supabase
    .from("session_switches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("switched_at", sinceISO);

  if ((switchCount ?? 0) >= SESSION_POLICY.SWITCH_LIMIT_COUNT) {
    await supabase.auth.signOut();
    const { data: oldest } = await supabase
      .from("session_switches")
      .select("switched_at")
      .eq("user_id", user.id)
      .gte("switched_at", sinceISO)
      .order("switched_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const unlockAt = oldest
      ? new Date(
          new Date(oldest.switched_at).getTime() +
            SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
        ).toISOString()
      : new Date(
          Date.now() + SESSION_POLICY.SWITCH_LIMIT_DAYS * 86_400_000,
        ).toISOString();
    const u = new URL("/login", url.origin);
    u.searchParams.set("conflict", "monthly_limit");
    u.searchParams.set("unlockAt", unlockAt);
    u.searchParams.set("switchesUsed", String(switchCount ?? 0));
    return NextResponse.redirect(u);
  }

  // Cooldown activo?
  const cooldownEnd = new Date(
    new Date(existing.created_at).getTime() +
      SESSION_POLICY.COOLDOWN_HOURS * 3_600_000,
  );
  if (new Date() < cooldownEnd) {
    await supabase.auth.signOut();
    const u = new URL("/login", url.origin);
    u.searchParams.set("conflict", "cooldown");
    u.searchParams.set("currentDevice", existing.device_label ?? "Otro device");
    u.searchParams.set("currentSince", existing.created_at);
    u.searchParams.set("retryAt", cooldownEnd.toISOString());
    return NextResponse.redirect(u);
  }

  // Conflict resolvable: para magic link, hacemos auto-replace porque no
  // hay UI inline. La política es "el último login gana" cuando ambos
  // están fuera de cooldown. Logueamos en session_switches.
  const admin = createAdminClient();
  await admin.from("session_switches").insert({
    user_id: user.id,
    device_type: deviceType,
    old_device_label: existing.device_label,
    new_device_label: deviceLabel,
  });
  await supabase
    .from("user_sessions")
    .update({
      device_label: deviceLabel,
      device_id: deviceId,
      auth_session_id: authSessionId,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  return redirectWithCookie(new URL(next, url.origin));
}
