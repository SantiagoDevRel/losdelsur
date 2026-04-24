// app/login/login-view.tsx
// Login con Google OAuth + magic link por email.
// El magic link usa Supabase Auth: envía email con código OTP o link
// → click → volves a /auth/callback?code=... → exchange → logueado.

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptic";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/perfil";

  const supabase = createClient();

  async function handleGoogle() {
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
      setErr(error.message || "No se pudo iniciar con Google. ¿Está configurado el provider?");
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
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
      setErr(error.message || "No se pudo enviar el link. Revisá el email.");
      haptic("error");
    } else {
      setSent(true);
      haptic("double");
    }
  }

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      {/* Top: back */}
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

      {/* Google */}
      <section className="px-5 pb-3">
        <button
          type="button"
          onClick={handleGoogle}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-white text-[13px] font-extrabold uppercase tracking-[0.08em] text-black hover:bg-white/90"
        >
          <GoogleLogo />
          CONTINUAR CON GOOGLE
        </button>
      </section>

      {/* Divider */}
      <div className="mx-5 my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">o</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* Magic link */}
      <section className="px-5">
        {sent ? (
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
              Tocalo desde tu celu para entrar. El link vive 1 hora.
            </p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
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

        {err && (
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
            {err}
          </p>
        )}
      </section>

      <p className="mt-8 px-5 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-white/40">
        AL ENTRAR ACEPTÁS QUE USEMOS TU EMAIL
        <br />
        PARA MANTENER TU CUENTA SEGURA.
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
