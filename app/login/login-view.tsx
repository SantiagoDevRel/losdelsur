// app/login/login-view.tsx
// Login con dos métodos:
//   1. CELULAR (OTP) — primario. Para sureños sin gmail.
//      Usa Supabase Phone Auth (con SMS por Twilio o WhatsApp por
//      Twilio Business / Cloud API). Cambiar de SMS a WhatsApp es solo
//      un toggle en Supabase Dashboard sin tocar este código.
//   2. EMAIL (magic link) — secundario.
//
// El flow del celular es 2 pasos: pedir el OTP, luego verificarlo.
//
// Google OAuth fue removido — la mayoría de los sureños no usa gmail
// y mantener un botón roto era peor UX que no tenerlo.

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptic";
import {
  SessionConflictModal,
  type ConflictKind,
} from "@/components/session-conflict-modal";

// Países más probables para los sureños. Si elegís "Otro" cargás el
// código manualmente. Default: +57 Colombia.
const PAISES = [
  { code: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
  { code: "+34", flag: "🇪🇸", name: "España" },
  { code: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "+52", flag: "🇲🇽", name: "México" },
  { code: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "+58", flag: "🇻🇪", name: "Venezuela" },
  { code: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "+51", flag: "🇵🇪", name: "Perú" },
];

type Method = "phone" | "email";
type PhoneStep = "input" | "otp";

export function LoginView() {
  const [method, setMethod] = useState<Method>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("input");
  const [pais, setPais] = useState("+57");
  const [numero, setNumero] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictKind | null>(null);
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/perfil";

  // Memoizado para que la referencia sea estable entre renders.
  const supabase = useMemo(() => createClient(), []);

  // Si llegan a /login con ?error=auth (callback OAuth fallido), mostrar.
  // Si llegan con ?conflict=... (magic link rechazado por slot ocupado /
  // cooldown / cap), mostrar el modal correspondiente.
  /* eslint-disable react-hooks/set-state-in-effect -- query params → estado UI inicial */
  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setErr("No se pudo completar el inicio de sesión. Probá de nuevo.");
      return;
    }
    if (searchParams.get("error") === "kicked") {
      setErr("Tu sesión se cerró desde otro dispositivo. Volvé a entrar si querés seguir acá.");
      return;
    }
    const c = searchParams.get("conflict");
    if (c === "cooldown") {
      const retryAt = searchParams.get("retryAt");
      const currentDevice = searchParams.get("currentDevice");
      const currentSince = searchParams.get("currentSince");
      if (retryAt && currentDevice && currentSince) {
        setConflict({ kind: "cooldown", currentDevice, currentSince, retryAt });
      }
    } else if (c === "monthly_limit") {
      const unlockAt = searchParams.get("unlockAt");
      const switchesUsed = Number(searchParams.get("switchesUsed") ?? "0");
      if (unlockAt) {
        setConflict({ kind: "monthly_limit", switchesUsed, limit: 3, unlockAt });
      }
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ----- Phone OTP -----

  // E.164: +<pais><numero> sin espacios ni guiones.
  function buildPhone(): string {
    const cleaned = numero.replace(/\D/g, "");
    return `${pais}${cleaned}`;
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = numero.replace(/\D/g, "");
    if (cleaned.length < 7) {
      setErr("Número inválido");
      return;
    }
    haptic("tap");
    setSending(true);
    setErr(null);
    const phone = buildPhone();
    // Server-side: las cookies post-auth se setean via Set-Cookie HttpOnly
    // (iOS Safari las respeta), evitando los quirks del browser client.
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, channel: "sms" }),
      });
      setSending(false);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(body?.error ?? "No se pudo mandar el código");
        haptic("error");
        return;
      }
      haptic("double");
      setPhoneStep("otp");
    } catch (e) {
      setSending(false);
      setErr(e instanceof Error ? e.message : "Error de red");
      haptic("error");
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) {
      setErr("El código tiene 6 dígitos");
      return;
    }
    haptic("tap");
    setSending(true);
    setErr(null);
    const phone = buildPhone();
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, token: otp }),
        credentials: "include",
      });
      setSending(false);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(body?.error ?? "Código inválido o vencido");
        haptic("error");
        return;
      }
      haptic("double");
      // Cookies ya quedaron persistidas server-side. Registramos sesión
      // (no bloqueante: si falla, redirect igual al perfil).
      await registerSessionAndRedirect();
    } catch (e) {
      setSending(false);
      setErr(e instanceof Error ? e.message : "Error de red");
      haptic("error");
    }
  }

  // Registra la sesión actual en /api/sessions/register. Si todo OK,
  // redirige a `next`. Si hay conflicto, muestra modal apropiado.
  //
  // CRÍTICO: si la request falla por red/timeout/error técnico, NO
  // bloqueamos al user — la sesión Supabase ya está creada (verifyOtp
  // ya succeded). El registro en user_sessions es defensivo (limit
  // anti-sharing); fallarlo silenciosamente es mejor que bloquear un
  // login legítimo. El heartbeat post-login con grace pre_register
  // cubre el caso "no me registré pero estoy en /perfil".
  //
  // Solo BLOQUEAMOS cuando el server respondió explícitamente con
  // 409 conflict/cooldown o 429 monthly_limit — esas son decisiones
  // intencionales del backend.
  async function registerSessionAndRedirect(force = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response | null = null;
    try {
      res = await fetch(
        `/api/sessions/register${force ? "?force=true" : ""}`,
        { method: "POST", signal: controller.signal, credentials: "include" },
      );
    } catch (e) {
      // Network error / timeout / Safari quirks — redirect anyway.
      // La sesión Supabase está bien; el session-limit lo retomamos
      // en el siguiente registro automático o vía heartbeat.
      console.warn("[login] /api/sessions/register failed, redirecting anyway:", e);
      window.location.href = nextParam;
      return;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.ok) {
      window.location.href = nextParam;
      return;
    }
    if (res.status === 401) {
      setErr("No se pudo verificar la sesión. Probá de nuevo.");
      return;
    }
    // Cualquier 5xx u otro código no-conflicto → redirect igual (no
    // bloqueamos por bug de servidor).
    if (res.status >= 500) {
      console.warn("[login] /api/sessions/register 5xx, redirecting anyway:", res.status);
      window.location.href = nextParam;
      return;
    }

    const body = (await res.json().catch(() => null)) as
      | {
          error?: string;
          currentDevice?: string;
          currentSince?: string;
          retryAt?: string;
          switchesUsed?: number;
          limit?: number;
          unlockAt?: string;
        }
      | null;
    if (!body) {
      // No body parseable — redirect igual.
      console.warn("[login] /api/sessions/register no body, redirecting anyway");
      window.location.href = nextParam;
      return;
    }

    if (body.error === "monthly_limit" && body.unlockAt) {
      setConflict({
        kind: "monthly_limit",
        switchesUsed: body.switchesUsed ?? 0,
        limit: body.limit ?? 3,
        unlockAt: body.unlockAt,
      });
    } else if (body.error === "cooldown" && body.retryAt && body.currentDevice) {
      setConflict({
        kind: "cooldown",
        currentDevice: body.currentDevice,
        currentSince: body.currentSince ?? new Date().toISOString(),
        retryAt: body.retryAt,
      });
    } else if (body.error === "conflict" && body.currentDevice) {
      setConflict({
        kind: "conflict",
        currentDevice: body.currentDevice,
        currentSince: body.currentSince ?? new Date().toISOString(),
      });
    } else {
      // Error desconocido — redirect igual, no es un conflicto real.
      console.warn("[login] /api/sessions/register unknown error, redirecting anyway:", body);
      window.location.href = nextParam;
    }
  }

  async function handleConflictConfirm() {
    await registerSessionAndRedirect(true);
  }

  async function handleConflictCancel() {
    setConflict(null);
    // El user canceló el reemplazo → cerramos su sesión local para que no
    // quede a medio loguear (cookie con auth pero sin user_sessions row).
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop */
    }
  }

  // ----- Email magic link -----

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    haptic("tap");
    setSending(true);
    setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
      },
    });
    setSending(false);
    if (error) {
      setErr(error.message || "No se pudo enviar el link");
      haptic("error");
    } else {
      setEmailSent(true);
      haptic("double");
    }
  }

  // ----- Render -----

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <div className="px-5 pb-2 sm:pb-4">
        <Link
          href="/"
          aria-label="Volver"
          className="inline-grid size-10 place-items-center bg-black/60 text-white"
        >
          <ArrowLeft size={20} />
        </Link>
      </div>

      <header className="px-5 pb-4">
        <div className="eyebrow">ÚNETE AL PARCHE</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 56, lineHeight: 0.85 }}
        >
          ENTRAR
        </h1>
        <p className="mt-3 max-w-md text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
          Guardá favoritas y descargas en tu cuenta. Si cambiás de celu, no
          perdés nada.
        </p>
      </header>

      {/* Tabs Phone / Email */}
      <div className="mx-5 mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMethod("phone");
            setErr(null);
          }}
          className="flex h-12 items-center justify-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all"
          style={{
            background: method === "phone" ? "var(--color-verde-neon)" : "transparent",
            color: method === "phone" ? "#000" : "#ddd",
            border: `2px solid ${method === "phone" ? "var(--color-verde-neon)" : "rgba(255,255,255,0.18)"}`,
          }}
        >
          <Phone size={14} />
          CELULAR
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("email");
            setErr(null);
          }}
          className="flex h-12 items-center justify-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all"
          style={{
            background: method === "email" ? "var(--color-verde-neon)" : "transparent",
            color: method === "email" ? "#000" : "#ddd",
            border: `2px solid ${method === "email" ? "var(--color-verde-neon)" : "rgba(255,255,255,0.18)"}`,
          }}
        >
          <Mail size={14} />
          EMAIL
        </button>
      </div>

      {/* Phone flow */}
      {method === "phone" && phoneStep === "input" && (
        <form onSubmit={sendOtp} className="px-5">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              TU CELULAR
            </span>
            <div className="mt-1 flex gap-2">
              <select
                value={pais}
                onChange={(e) => setPais(e.target.value)}
                className="h-12 shrink-0 rounded-lg border-2 border-white/20 bg-black px-2 text-[13px] font-semibold text-white focus:border-[var(--color-verde-neon)] focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
                aria-label="Código de país"
              >
                {PAISES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.flag} {p.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="3001234567"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                required
                disabled={sending}
                className="h-12 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[14px] font-semibold tracking-[0.03em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
              Te mandamos un código de 6 dígitos por SMS.
            </p>
          </label>
          <button
            type="submit"
            disabled={sending || numero.replace(/\D/g, "").length < 7}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[13px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                ENVIANDO...
              </>
            ) : (
              <>
                <MessageCircle size={16} />
                MANDARME EL CÓDIGO
              </>
            )}
          </button>
        </form>
      )}

      {method === "phone" && phoneStep === "otp" && (
        <form onSubmit={verifyOtp} className="px-5">
          <div className="mb-3 rounded-lg border-2 border-[var(--color-verde-neon)] bg-black p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">
              CÓDIGO ENVIADO A
            </p>
            <p
              className="mt-1 uppercase text-white"
              style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
            >
              {buildPhone()}
            </p>
            <button
              type="button"
              onClick={() => {
                setPhoneStep("input");
                setOtp("");
                setErr(null);
              }}
              className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-verde-neon)] hover:underline"
            >
              ← Cambiar número
            </button>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              CÓDIGO DE 6 DÍGITOS
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              disabled={sending}
              className="mt-1 h-14 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-center text-[28px] font-bold tracking-[0.5em] text-white placeholder:text-white/20 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </label>

          <button
            type="submit"
            disabled={sending || otp.length < 6}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[13px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                VERIFICANDO...
              </>
            ) : (
              "ENTRAR"
            )}
          </button>
        </form>
      )}

      {/* Email flow */}
      {method === "email" && (
        <section className="px-5">
          {emailSent ? (
            <div className="rounded-xl border-2 border-[var(--color-verde-neon)] bg-black p-5">
              <Mail className="mb-3 text-[var(--color-verde-neon)]" size={28} />
              <p
                className="uppercase text-white"
                style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
              >
                REVISÁ TU EMAIL
              </p>
              <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.04em] text-white/60">
                Te mandamos un link a <span className="text-white">{email}</span>.
                Tocalo desde tu celu para entrar.
              </p>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
                  EMAIL
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="vos@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={sending}
                  className="mt-1 h-12 w-full rounded-lg border-2 border-white/20 bg-black px-4 text-[14px] font-semibold uppercase tracking-[0.03em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </label>
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[13px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    ENVIANDO...
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    MANDARME LINK
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      )}

      {err && (
        <p className="mx-5 mt-4 text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
          {err}
        </p>
      )}

      <p className="mt-8 px-5 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-white/40">
        AL ENTRAR ACEPTÁS NUESTRA{" "}
        <Link href="/privacy" className="text-white/60 underline">
          POLÍTICA DE PRIVACIDAD
        </Link>
      </p>

      {conflict && (
        <SessionConflictModal
          data={conflict}
          onConfirm={handleConflictConfirm}
          onCancel={handleConflictCancel}
        />
      )}
    </main>
  );
}

