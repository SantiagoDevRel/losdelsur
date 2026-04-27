// app/api/auth/wa-magic/route.ts
// Consumidor del WhatsApp magic-link. Llega vía botón CTA del bot:
// /api/auth/wa-magic?token=<64-hex>
//
// Pasos:
//   1. Validar token (existe, no expirado, no consumido).
//   2. Consumo atómico: UPDATE ... WHERE consumed_at IS NULL retorna
//      la row solo si nadie más la tomó. Race-safe.
//   3. Buscar/crear auth user para el phone (RPC find_auth_user_id_by_phone).
//   4. Asegurar email sintético (necesario para generateLink magiclink).
//   5. admin.generateLink({type:'magiclink'}) → hashed_token.
//   6. supabase.auth.verifyOtp({type:'magiclink', token_hash}) → setea
//      cookies HttpOnly via setAll callback del server client.
//   7. Inline session-register (replica /auth/callback) para cumplir
//      "1 mobile + 1 desktop" + cooldown + cap.
//   8. Redirect a `next` (default /perfil).
//
// Errores de token devuelven HTML simple (no JSON) porque el user llega
// desde un browser fresh, no desde fetch. Mejor UX que un objeto JSON.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailForPhone, isValidNormalizedPhone } from "@/lib/auth/phone";
import {
  buildDeviceLabel,
  decodeJWTSessionId,
  DEVICE_ID_COOKIE,
  DEVICE_ID_COOKIE_MAX_AGE_S,
  detectDeviceType,
  generateDeviceId,
  SESSION_POLICY,
} from "@/lib/sessions/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = url.searchParams.get("next") ?? "/perfil";

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return errorPage("Link inválido. Pedí uno nuevo desde la app.");
  }

  const admin = createAdminClient();

  // 1+2. Consumo atómico. UPDATE devuelve la row solo si:
  //   - el token existe
  //   - consumed_at IS NULL (nadie más lo usó)
  //   - expires_at > now() (no vencido)
  // Si cualquier condición falla, .data viene null y abortamos.
  const { data: consumed, error: consumeErr } = await admin
    .from("wa_magic_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .select("phone")
    .maybeSingle();

  if (consumeErr) {
    console.error("[wa-magic] consume error", consumeErr);
    return errorPage("Algo falló. Probá pedir un link nuevo.");
  }
  if (!consumed) {
    return errorPage(
      "Este link ya se usó o se venció. Mandale un mensaje al bot otra vez para que te mande uno nuevo.",
    );
  }

  const phone = consumed.phone;
  if (!isValidNormalizedPhone(phone)) {
    return errorPage("Token corrupto.");
  }

  // 3. Buscar auth user existente (matchea SMS y WA).
  const { data: existingId, error: findErr } = await admin.rpc(
    "find_auth_user_id_by_phone",
    { p_phone: phone },
  );
  if (findErr) {
    console.error("[wa-magic] rpc find error", findErr);
    return errorPage("No pudimos buscar tu cuenta. Probá de nuevo.");
  }

  const synthEmail = emailForPhone(phone);
  let userId: string | null = (existingId as string | null) ?? null;

  if (userId) {
    // 4a. Asegurar email sintético en el user existente. Si ya tiene
    // email real (entró por magic-link email antes), no lo pisamos —
    // generateLink puede usar cualquier email del user.
    const { data: userRecord } = await admin.auth.admin.getUserById(userId);
    if (userRecord.user && !userRecord.user.email) {
      await admin.auth.admin.updateUserById(userId, {
        email: synthEmail,
        email_confirm: true,
      });
    }
  } else {
    // 4b. Crear user nuevo con phone + email sintético confirmados.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone,
      email: synthEmail,
      email_confirm: true,
      phone_confirm: true,
    });
    if (createErr || !created.user) {
      console.error("[wa-magic] createUser error", createErr);
      return errorPage("No pudimos crear tu cuenta. Probá de nuevo.");
    }
    userId = created.user.id;
  }

  // 5. Generar magic-link admin → nos da hashed_token que verifyOtp acepta.
  // El `email` que pasamos a generateLink debe matchear el del auth user.
  const { data: targetUser } = await admin.auth.admin.getUserById(userId);
  const linkEmail = targetUser.user?.email ?? synthEmail;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: linkEmail,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    console.error("[wa-magic] generateLink error", linkErr);
    return errorPage("No pudimos generar tu sesión. Probá de nuevo.");
  }

  // 6. verifyOtp con el server client → persiste cookies HttpOnly via setAll.
  const supabase = await createClient();
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr || !verifyData.session || !verifyData.user) {
    console.error("[wa-magic] verifyOtp error", verifyErr);
    return errorPage("No pudimos abrir tu sesión. Probá pedir otro link.");
  }

  const user = verifyData.user;
  const session = verifyData.session;

  // 7. Inline session-register (idéntico patrón a /auth/callback).
  // Esto enforza "1 mobile + 1 desktop" + cooldown + cap.
  const authSessionId = decodeJWTSessionId(session.access_token);
  if (!authSessionId) {
    // Sesión válida pero sin claim session_id — redirect plano sin tracking.
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const ua = request.headers.get("user-agent") ?? "";
  const deviceType = detectDeviceType(ua);
  const deviceLabel = buildDeviceLabel(ua);

  const cookieStore = await cookies();
  let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  let setNewCookie = false;
  if (!deviceId) {
    deviceId = generateDeviceId();
    setNewCookie = true;
  }

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

  const { data: existing } = await supabase
    .from("user_sessions")
    .select("id, auth_session_id, device_id, device_label, created_at")
    .eq("user_id", user.id)
    .eq("device_type", deviceType)
    .maybeSingle();

  // Misma sesión Supabase ya registrada — solo refresh.
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

  // Mismo device físico (device_id matchea) — refresh, no switch.
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

  // Slot vacío — insert.
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

  // Conflicto: otro device físico ocupa el slot. Magic-link (ambos email
  // y WA) no tiene UI inline → redirigimos a /login con params para que
  // el cliente muestre el modal.

  // Hard cap mensual.
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

  // Cooldown 24h.
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

  // Auto-replace (último-login-gana fuera de cooldown). Audit log.
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

// HTML simple para errores. El user llega aquí desde browser, no fetch,
// así que JSON sería confuso. Botón "volver al login" para retomar.
function errorPage(message: string): NextResponse {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Los del Sur — link inválido</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #000; color: #fff; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
  .card { max-width: 380px; text-align: center; }
  h1 { font-size: 18px; letter-spacing: .04em; text-transform: uppercase; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.7); margin: 0 0 24px; }
  a { display: inline-block; padding: 12px 24px; background: #c5fb43; color: #000; text-decoration: none; font-weight: 800; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; border-radius: 8px; }
</style>
</head>
<body>
  <div class="card">
    <h1>No pudimos entrarte</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/login">VOLVER AL LOGIN</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
