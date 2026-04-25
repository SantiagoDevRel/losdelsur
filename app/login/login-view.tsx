// app/login/login-view.tsx
// Login con tres métodos en orden de prioridad:
//   1. CELULAR (OTP) — primario. Pensado para sureños sin gmail.
//      Usa Supabase Phone Auth con Twilio (SMS) por detrás. Se puede
//      migrar a WhatsApp en el dashboard de Supabase sin cambiar el
//      código del cliente.
//   2. EMAIL (magic link) — secundario.
//   3. GOOGLE OAuth — terciario. Solo se muestra si el provider está
//      habilitado en Supabase. Para activarlo, ver docs/AUTH-SETUP.md.
//
// El flow del celular es 2 pasos: pedir el OTP, luego verificarlo.

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptic";

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

// Flag para mostrar/esconder Google. Lo encendés cuando termines el setup
// del provider en Supabase Dashboard. Default: off, para no mostrar un
// botón roto a los sureños.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

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
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/perfil";

  const supabase = createClient();

  // Si llegan a /login con ?error=auth (callback OAuth fallido), mostrar.
  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setErr("No se pudo completar el inicio de sesión. Probá de nuevo.");
    }
  }, [searchParams]);

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
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" }, // si activás WhatsApp, cambiá a "whatsapp"
    });
    setSending(false);
    if (error) {
      // Errores típicos:
      //  - "Phone signups are disabled" → activar Phone provider en Supabase
      //  - "SMS sending failed" → credenciales Twilio mal seteadas
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("phone signups") || msg.includes("provider")) {
        setErr("Login por celular no está activado todavía. Probá con email.");
      } else if (msg.includes("rate") || msg.includes("limit")) {
        setErr("Muchos intentos. Esperá un minuto.");
      } else {
        setErr(error.message || "No se pudo mandar el código");
      }
      haptic("error");
      return;
    }
    haptic("double");
    setPhoneStep("otp");
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
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });
    setSending(false);
    if (error) {
      setErr(error.message || "Código inválido o vencido");
      haptic("error");
      return;
    }
    haptic("double");
    // El UserProvider detecta el cambio de sesión y refresca; si falta
    // ciudad, RegisterGate aparece. Solo redirigimos a `next`.
    window.location.href = nextParam;
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

  // ----- Google OAuth -----

  async function signInWithGoogle() {
    haptic("tap");
    setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
      },
    });
    if (error) {
      setErr("Google no está disponible aún. Usá celular o email.");
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

      {/* Google OAuth — solo si está habilitado */}
      {GOOGLE_ENABLED && (
        <>
          <div className="mx-5 my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">o</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <section className="px-5">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-white text-[13px] font-extrabold uppercase tracking-[0.08em] text-black hover:bg-white/90"
            >
              <GoogleLogo />
              CONTINUAR CON GOOGLE
            </button>
          </section>
        </>
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
    </main>
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.2-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.7 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.3-.1-2.6-.3-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.7 6.4 29 4.5 24 4.5 16.4 4.5 9.8 8.8 6.3 14.1z" />
      <path fill="#4CAF50" d="M24 43.5c4.9 0 9.4-1.9 12.8-4.9l-5.9-5c-2 1.4-4.4 2.2-6.9 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.3 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.1-2.1 3.9-3.9 5.2l5.9 5c-.4.4 6.5-4.7 6.5-14.2 0-1.3-.1-2.6-.2-3.9z" />
    </svg>
  );
}
